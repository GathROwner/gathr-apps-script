import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveRelevantImageUrlForEvent,
  selectDisplayImageFromAnalysis,
  selectDisplayImageFromCarouselOrder,
} from './postParser.js';

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
