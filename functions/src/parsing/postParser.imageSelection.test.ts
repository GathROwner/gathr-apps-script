import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AnalysisImageFrame,
  findMissingExpectedCalendarSlots,
  findMissingExpectedCalendarNames,
  findMissingExpectedCalendarSlotsInFinalEvents,
  applyReviewedCalendarRoomAliases,
  processEvents,
  resolveRelevantImageUrlForEvent,
  selectUnusedManagedImageUrls,
  selectDisplayImageFromAnalysis,
  selectDisplayImageFromCarouselOrder,
} from './postParser.js';

test('source-reviewed names reject small model spelling and word omissions', () => {
  const expected = [
    { date: '2026-06-05', name: 'Masters of Reality' },
    { date: '2026-06-27', name: 'Laura & Don' },
  ];
  const bad = [
    { date: '2026-06-05', name: 'Masters Reality', description: '' },
    { date: '2026-06-27', name: 'Laura Goon', description: '' },
  ] as any;
  assert.deepEqual(findMissingExpectedCalendarNames(bad, expected), [
    '2026-06-05:Masters of Reality', '2026-06-27:Laura & Don',
  ]);
  assert.deepEqual(findMissingExpectedCalendarNames([
    { date: '2026-06-05', name: 'Masters of Reality', description: '' },
    { date: '2026-06-27', name: 'Concert', description: 'Laura & Don perform' },
  ] as any, expected), ['2026-06-27:Laura & Don']);
  assert.deepEqual(findMissingExpectedCalendarNames([
    { date: '2026-06-27', name: 'Concert', description: 'Laura & Don perform' },
  ] as any, [{ date: '2026-06-27', name: 'Laura & Don', allowDescription: true }]), []);
  assert.deepEqual(findMissingExpectedCalendarNames([
    { date: '2026-02-12', name: 'Early Trivia', description: 'w/ Darcy' },
  ] as any, [{ date: '2026-02-12', name: 'Early Trivia with Darcy', allowDescription: true }]), []);
  assert.deepEqual(findMissingExpectedCalendarNames([
    { date: '2026-09-05', name: 'Music Bingo with Darcy', description: '' },
  ] as any, [{ date: '2026-09-05', name: 'Music Bingo! with Darcy' }]), []);
});

test('source-reviewed room aliases retain the host and room separately', () => {
  const rules = [{ hostVenue: 'The Factory Downtown', roomAliases: ['Comedy Cave'] }] as any;
  const items = [
    { establishment: 'Comedy Cave', venue: 'Comedy Cave', additionalLocation: '' },
    { establishment: 'The Comedy Cave', venue: 'The Comedy Cave', additionalLocation: 'The Comedy Cave' },
    { establishment: 'Other Venue', venue: '', additionalLocation: '' },
  ];
  assert.deepEqual(applyReviewedCalendarRoomAliases(items, rules), [
    { establishment: 'The Factory Downtown', venue: '', additionalLocation: 'Comedy Cave' },
    { establishment: 'The Factory Downtown', venue: '', additionalLocation: 'The Comedy Cave' },
    items[2],
  ]);
});

test('four calendar bands resolve to their original carousel image, not the band number', () => {
  const cover = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/cover.webp';
  const calendar = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/calendar.webp';
  const market = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/market.webp';
  const frameUrls = ['cover-frame', 'calendar-band-1', 'calendar-band-2',
    'calendar-band-3', 'calendar-band-4', 'market-frame'];
  const frames: AnalysisImageFrame[] = frameUrls.map((imageUrl, index) => ({
    imageUrl,
    sourceUrl: index === 0 ? 'cover-source' : index === 5 ? 'market-source' : 'calendar-source',
    sourceGalleryIndex: index === 0 ? 0 : index === 5 ? 2 : 1,
    displayUrl: index === 0 ? cover : index === 5 ? market : calendar,
    kind: index > 0 && index < 5 ? 'calendar_band' : 'whole',
  }));
  for (const bandIndex of [1, 2, 3, 4]) {
    const resolved = resolveRelevantImageUrlForEvent(
      { relevantImageIndex: bandIndex } as any,
      frameUrls,
      [cover, calendar, market],
      [],
      frames
    );
    assert.equal(resolved.url, calendar);
    assert.equal(resolved.reason, 'model_selected_analysis_frame_source');
  }
  assert.equal(resolveRelevantImageUrlForEvent(
    { relevantImageIndex: 5 } as any, frameUrls, [cover, calendar, market], [], frames
  ).url, market);
});

test('an unmapped band cannot become an event image', () => {
  const frames: AnalysisImageFrame[] = [{
    imageUrl: 'calendar-band-1', sourceUrl: 'calendar-source', sourceGalleryIndex: 1,
    displayUrl: '', kind: 'calendar_band',
  }];
  const selected = resolveRelevantImageUrlForEvent(
    { relevantImageIndex: 0 } as any,
    ['calendar-band-1'],
    ['https://storage.googleapis.com/gathr-uploaded-images/postimages/cover.webp'],
    [],
    frames
  );
  assert.equal(selected.url, '');
  assert.equal(selected.reason, 'unmapped_analysis_frame');
});

test('caption-only listing keeps post media as context without claiming an image match', () => {
  const image = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/seawalk.webp';
  const listing = { name: 'BYOC (Bring Your Own Craft) nights', relevantImageIndex: -1 } as any;
  const selected = resolveRelevantImageUrlForEvent(
    listing, ['analysis-frame'], [image], [{ imageIndex: 0, description: 'Seawalk workshops' }]
  );
  assert.deepEqual(selected, { url: '', reason: 'caption_only_event_no_image_match' });

  const [processed] = processEvents(
    [listing], 'Seawalk Studio', '', '', ['analysis-frame'], [image], [],
    { id: '1715992940535525' } as any
  );
  assert.equal(processed.image, image);
  assert.equal(processed.relevantImageUrl, image);
  assert.deepEqual(processed.mediaUrls, [image]);
  assert.equal(processed.imageProvenance?.primarySource, 'post_media');
  assert.equal(processed.imageProvenance?.isFallback, true);
  assert.equal(processed.imageProvenance?.selectionReason, 'caption_only_post_media_context');
});

test('cleanup retains every source gallery image while discarding temporary bands', () => {
  const base = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/';
  const sources = Array.from({ length: 5 }, (_, index) => `${base}source-${index}.webp`);
  const bands = Array.from({ length: 4 }, (_, index) => `${base}band-${index}.webp`);
  const deleted = selectUnusedManagedImageUrls(
    [...sources, `${base}ocr-base.webp`, ...bands],
    [{ image: sources[0], relevantImageUrl: sources[4], mediaUrls: sources } as any]
  );
  assert.deepEqual(deleted, [`${base}ocr-base.webp`, ...bands]);
  assert.deepEqual(selectUnusedManagedImageUrls(
    [...sources, `${base}ocr-base.webp`, ...bands], []
  ), [...sources, `${base}ocr-base.webp`, ...bands]);
});

test('calendar band gate finds missing dated slots, including simultaneous listings', () => {
  const actual = [
    { date: '2026-07-02', startTime: '6:00 PM' },
    { date: '2026-07-02', startTime: '18:00' },
    { date: '2026-07-03', startTime: '10:00 PM' },
  ] as any;
  assert.deepEqual(findMissingExpectedCalendarSlots(actual, [
    '2026-07-02@18:00', '2026-07-02@18:00', '2026-07-03@22:00',
  ]), []);
  assert.deepEqual(findMissingExpectedCalendarSlots(actual, [
    '2026-07-02@18:00', '2026-07-02@18:00', '2026-07-03@22:00',
    '2026-07-04@18:00',
  ]), ['2026-07-04@18:00']);
});

test('final calendar gate expands bounded weekly series before checking source slots', () => {
  const events = [{
    name: 'Carter MacLellan', startDate: '2026-07-01', startTime: '18:00',
    isRecurring: true, recurringPattern: 'weekly_wednesday',
    totalOccurrences: 5, recurrenceUntilDate: '2026-07-29',
  }] as any;
  const slots = ['2026-07-01@18:00', '2026-07-08@18:00', '2026-07-15@18:00',
    '2026-07-22@18:00', '2026-07-29@18:00'];
  assert.deepEqual(findMissingExpectedCalendarSlotsInFinalEvents(events, slots), []);
  assert.deepEqual(findMissingExpectedCalendarSlotsInFinalEvents(events.slice(0, 0), slots), slots);
  assert.deepEqual(findMissingExpectedCalendarSlotsInFinalEvents(
    [{ ...events[0], totalOccurrences: 4 }], slots
  ), ['2026-07-29@18:00']);
});

test('selects event-specific display image from image analysis descriptions', () => {
  const selected = selectDisplayImageFromAnalysis(
    {
      name: 'Wellness on the Waterfront',
      description: 'June 24 Wednesday | 5:15-6 PM.',
      category: 'Family Friendly',
    },
    [
      {
        imageIndex: 0,
        description: 'Interior photo of the food hall with people at the counter.',
        relevanceToPost: 'General post cover image.',
      },
      {
        imageIndex: 1,
        description:
          'Poster/photo for WELLNESS on the WATERFRONT showing outdoor yoga with text June 24 Wednesday 5:15-6 PM.',
        relevanceToPost: 'Specific event poster for Wellness on the Waterfront.',
      },
      {
        imageIndex: 2,
        description: 'Trivia Night poster with floral corners.',
        relevanceToPost: 'Specific event poster for trivia.',
      },
    ],
    ['https://storage.googleapis.com/gathr-uploaded-images/postimages/cover.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/trivia.webp']
  );

  assert.equal(
    selected,
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp'
  );
});

test('overrides default first-image index when analysis strongly matches another display image', () => {
  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'Wellness on the Waterfront',
      description: 'June 24 Wednesday | 5:15-6 PM.',
      category: 'Family Friendly',
      relevantImageIndex: 0,
    } as any,
    [],
    [
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/cover.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/soccer.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/trivia.webp',
    ],
    [
      {
        imageIndex: 0,
        description: 'Interior photo of the food hall with people at the counter.',
        relevanceToPost: 'General post cover image.',
      },
      {
        imageIndex: 1,
        description:
          'Poster/photo for WELLNESS on the WATERFRONT showing outdoor yoga with text June 24 Wednesday 5:15-6 PM.',
        relevanceToPost: 'Specific event poster for Wellness on the Waterfront.',
      },
      {
        imageIndex: 2,
        description: 'Blue group stage FIFA soccer schedule image.',
        relevanceToPost: 'Schedule poster for soccer matches.',
      },
      {
        imageIndex: 3,
        description: 'Trivia Night poster with floral corners.',
        relevanceToPost: 'Specific event poster for trivia.',
      },
    ]
  );

  assert.equal(
    resolved.url,
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp'
  );
  assert.equal(resolved.reason, 'image_analysis_match_over_default_first_image_index');
});

test('uses exact event date and time to select the matching UPEISU schedule page', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/1788531518053-xdlvzy.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/1788531518529-8zugmt.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/1788531518937-j4cy9f.webp',
  ];
  const imageAnalysis = [
    {
      imageIndex: 0,
      description:
        'September 2026 events from Sat 5 through Tue 15, including Toga Night, Disney Trivia, and Leader In The Making.',
      relevanceToPost: 'First page of the full UPEISU calendar, which also promotes a pool party later in September.',
    },
    {
      imageIndex: 1,
      description:
        'September events continued from Tue 15 through Wed 23, including Music Bingo and Karaoke Night.',
      relevanceToPost: 'Second page of the UPEISU September calendar.',
    },
    {
      imageIndex: 2,
      description:
        'September events continued. Fri 25 Pool Party from 8:30 PM to 10 PM in the Bell Aliant Centre.',
      relevanceToPost: 'Third page of the UPEISU September calendar.',
    },
  ];

  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'Pool Party',
      description: 'Pool party.',
      category: 'Gatherings & Parties',
      startDate: '2026-09-25',
      startTime: '20:30',
      endTime: '22:00',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    imageAnalysis
  );

  assert.equal(resolved.url, displayMediaUrls[2]);
  assert.equal(resolved.reason, 'image_analysis_match_over_default_first_image_index');
});

test('keeps the first UPEISU schedule page when its date, time, and title match', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/page-1.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/page-2.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/page-3.webp',
  ];
  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'Disney Trivia',
      description: 'Disney trivia night.',
      category: 'Trivia Night',
      startDate: '2026-09-09',
      startTime: '19:00',
      endTime: '21:00',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    [
      {
        imageIndex: 0,
        description: 'Wed 9 Disney Trivia from 7 PM to 9 PM in the Fox and Crow.',
        relevanceToPost: 'First page of the September calendar.',
      },
      {
        imageIndex: 1,
        description: 'September events continued from Tue 15 through Wed 23.',
        relevanceToPost: 'Second calendar page with other trivia events.',
      },
      {
        imageIndex: 2,
        description: 'September events continued from Wed 23 through Mon 28.',
        relevanceToPost: 'Third calendar page.',
      },
    ]
  );

  assert.equal(resolved.url, displayMediaUrls[0]);
  assert.equal(resolved.reason, 'model_selected_original_image_index');
});

test('does not override the first image for an alternate page that only shares the date', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/pool-poster.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/unrelated-september-25.webp',
  ];
  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'Pool Party',
      description: 'Pool party.',
      category: 'Gatherings & Parties',
      startDate: '2026-09-25',
      startTime: '20:30',
      endTime: '22:00',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    [
      {
        imageIndex: 0,
        description: 'Pool Party poster with swimmers at the Bell Aliant Centre.',
        relevanceToPost: 'Specific event poster.',
      },
      {
        imageIndex: 1,
        description: 'Fri 25 textbook sale from 8:30 AM to 10 AM.',
        relevanceToPost: 'A different event on the same date.',
      },
    ]
  );

  assert.equal(resolved.url, displayMediaUrls[0]);
  assert.equal(resolved.reason, 'model_selected_original_image_index');
});

test('keeps selected first image when alternate image only matches broad family or park terms', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/pei-nerf-wars.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/playground.webp',
  ];

  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'End of School Year Bash',
      description: 'PEI Nerf Wars outdoor games for kids and families.',
      category: 'Family Friendly',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    [
      {
        imageIndex: 0,
        description: 'PEI Nerf Wars poster with foam blasters and outdoor game branding.',
        relevanceToPost: 'Specific promotional image for the End of School Year Bash.',
      },
      {
        imageIndex: 1,
        description: 'Generic community park playground with families and children outside.',
        relevanceToPost: 'General family friendly park image.',
      },
    ]
  );

  assert.equal(resolved.url, displayMediaUrls[0]);
  assert.equal(resolved.reason, 'model_selected_original_image_index');
});

test('uses carousel order when image analysis collapses to the first source image', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/generic-cover.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/soccer.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/trivia.webp',
  ];

  const selected = selectDisplayImageFromCarouselOrder(
    {
      name: 'Wellness on the Waterfront',
      description: 'Dedicated calendar-style promo image shows June 24 Wednesday | 5:15-6 PM.',
      category: 'Family Friendly',
    },
    displayMediaUrls
  );

  assert.equal(selected.url, displayMediaUrls[1]);
  assert.equal(selected.reason, 'carousel_order_keyword_match_wellness');

  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'Wellness on the Waterfront',
      description: 'Dedicated calendar-style promo image shows June 24 Wednesday | 5:15-6 PM.',
      category: 'Family Friendly',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    [
      {
        imageIndex: 0,
        description: 'Poster-style image containing multiple text blocks.',
        relevanceToPost: 'General summary of the whole carousel.',
      },
    ]
  );

  assert.equal(resolved.url, displayMediaUrls[1]);
  assert.equal(resolved.reason, 'carousel_order_keyword_match_wellness');
});

test('does not use family-friendly category alone to select a trivia carousel image', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/pei-nerf-wars.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/soccer.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/trivia.webp',
  ];

  const resolved = resolveRelevantImageUrlForEvent(
    {
      name: 'End of School Year Bash',
      description: 'Outdoor activities and games for families.',
      category: 'Family Friendly',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    [
      {
        imageIndex: 0,
        description: 'PEI Nerf Wars poster with outdoor game branding.',
        relevanceToPost: 'Specific promotional image for the End of School Year Bash.',
      },
    ]
  );

  assert.equal(resolved.url, displayMediaUrls[0]);
  assert.equal(resolved.reason, 'model_selected_original_image_index');
});

test('uses carousel order for schedule and trivia cards when analysis is degenerate', () => {
  const displayMediaUrls = [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/generic-cover.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/soccer.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/trivia.webp',
  ];
  const imageAnalysis = [
    {
      imageIndex: 0,
      description: 'Poster-style image containing multiple text blocks.',
      relevanceToPost: 'General summary of the whole carousel.',
    },
  ];

  const soccer = resolveRelevantImageUrlForEvent(
    {
      name: 'Panama vs Sweden (Live Soccer)',
      description: 'Group Stage. Enjoy live soccer all around the hall.',
      category: 'Sports',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    imageAnalysis
  );
  assert.equal(soccer.url, displayMediaUrls[2]);
  assert.equal(soccer.reason, 'carousel_order_keyword_match_schedule');

  const trivia = resolveRelevantImageUrlForEvent(
    {
      name: 'Trivia Night',
      description: 'Join us for Trivia Fun! Trivia - Prizes - Family Friendly.',
      category: 'Trivia Night',
      relevantImageIndex: 0,
    } as any,
    [],
    displayMediaUrls,
    imageAnalysis
  );
  assert.equal(trivia.url, displayMediaUrls[3]);
  assert.equal(trivia.reason, 'carousel_order_keyword_match_trivia');
});
