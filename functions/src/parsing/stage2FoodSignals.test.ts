import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { classifyContent } from './contentClassifier.js';
import { detectStage2FoodSpecialSignals } from './stage2FoodSignals.js';

const zomburgerCaption = `The Zomburger

-Chipotle honey garlic
-Shredded lettuce
-Red onion
-Cheddar cheese
-Bacon
-Sour cream and onion chips
-Comes with a Halloween candy

Points East Coastal Drive`;

test('routes an advertised food-purchase candy bonus as a food special', () => {
  assert.deepEqual(detectStage2FoodSpecialSignals(zomburgerCaption), { hasAny: true });
});

test('does not route an ordinary burger-of-the-month menu feature as a deal', () => {
  assert.deepEqual(
    detectStage2FoodSpecialSignals('Burger of the month: chipotle honey garlic with lettuce, onion, cheddar, and bacon.'),
    { hasAny: false }
  );
});

test('does not treat candy wording without a named food purchase as a food special', () => {
  assert.deepEqual(detectStage2FoodSpecialSignals('A Halloween candy comes with every event ticket.'), { hasAny: false });
});

test('keeps the candy bonus eligible after stubbed negative Stage 2 classifications', async () => {
  const responsePrototype = (OpenAI.Responses as any).prototype;
  const originalCreate = responsePrototype.create;
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test-stage2-food-signal';

  try {
    for (const contentType of ['EVENT', 'FOOD_SPECIAL']) {
      responsePrototype.create = async () => ({
        output_text: JSON.stringify({
          contentType,
          contentAnalysis: {
            hasEvents: false,
            hasFoodSpecials: false,
            hasMultipleItems: false,
            organizationStyle: 'unstructured',
          },
          confidence: 0,
          estimatedItemCount: 0,
          classificationReason: 'Stubbed negative response',
        }),
        status: 'completed',
        usage: {},
      });
      const result = await classifyContent(zomburgerCaption, [], 'Holy Cow Burgers & Wings', undefined, {
        stage2ModelOverride: 'gpt-5.2',
      });
      assert.equal(result.contentType, 'FOOD_SPECIAL');
      assert.equal(result.contentAnalysis.hasFoodSpecials, true);
      assert.ok(result.confidence >= 0.6);
    }
  } finally {
    responsePrototype.create = originalCreate;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test('rejects ordinary inclusions, ingredients, ticket candy, and hypothetical or negated candy bonuses', () => {
  const nonOffers = [
    'Burger comes with dessert. Ingredients: chocolate, cream, sugar, and candy pieces.',
    'Burger of the month: chipotle honey garlic with lettuce, onion, cheddar, and bacon.',
    'A Halloween candy comes with every event ticket.',
    'Pizza is on our menu. Each admission ticket comes with a Halloween candy.',
    'We sell burgers, and the gift bag comes with a Halloween candy.',
    'No burger comes with a Halloween candy.',
    'The Zomburger does not come with a Halloween candy.',
    'Our dessert taco comes with candy sprinkles.',
    'The workshop comes with a Halloween candy gift bag.',
    `A burger is available on the ordinary menu. ${'More event information. '.repeat(10)}A Halloween candy comes with every event ticket.`,
    'The burger may come with a Halloween candy.',
    'The burger hypothetically comes with a Halloween candy.',
    'The burger never comes with a Halloween candy.',
    'The burger no longer comes with a Halloween candy.',
  ];
  for (const text of nonOffers) {
    assert.deepEqual(detectStage2FoodSpecialSignals(text), { hasAny: false }, text);
  }
});
