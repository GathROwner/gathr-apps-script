/** Conservative positive routing evidence. The model can also find specials in images.
 * This is not an eligibility filter or a complete food vocabulary.
 */
export function detectStage2FoodSpecialSignals(text: string): { hasAny: boolean } {
  const value = String(text || '').toLowerCase();
  const explicit = /\b(?:happy\s*hour|wings?\s+night|(?:two|\d+)\s+can\s+dine|(?:food|drinks?|brunch|breakfast|lunch|dinner)\s+specials?)\b/;
  if (explicit.test(value)) return { hasAny: true };

  // Require a nearby offer and food/drink context. An address, admission fee,
  // special guest/gift, or room rate alone cannot create a food-special route.
  const foodWords = '(?:food|drinks?|brunch|breakfast|lunch|dinner|meals?|appetizers?|desserts?|cocktails?|beer|wine|wings?|burgers?|pizza|fish\\s*cakes?|tacos?|soup|sandwich(?:es)?|coffee)';
  const food = new RegExp('\\b' + foodWords + '\\b', 'g');
  const offer = /\b(?:specials?|deals?|half[ -]?price|two[ -]for[ -]one|2[ -]for[ -]1|\d+\s*%\s*off)\b/;
  const pricedFood = new RegExp('\\$\\s*\\d+(?:\\.\\d{1,2})?\\s*(?:for\\s+)?' + foodWords + '\\b|\\b' + foodWords + '\\s*(?:for|only|just|:)?\\s*\\$\\s*\\d');
  const clauses = value.split(/[\n!?;]|\.(?=\s|$)/);
  const hasAny = clauses.some((clause) => {
    // One admission including food and entertainment is an activity, not
    // positive evidence of a separately available meal/drink offer.
    if (/\b(?:tickets?|admission|package)\b.{0,48}\b(?:includes?|covers?)\b/.test(clause) &&
        /\b(?:concert|show|performance|live\s+music|workshop|tasting)\b/.test(clause)) return false;
    // A printed ordinary stock/menu price is not itself an advertised deal.
    if (/\b(?:restocked?|back\s+in\s+stock|usual\s+(?:menu\s+)?price|(?:monthly|featured)\s+menu|all\s+month|month[ -]long)\b/.test(clause) && !offer.test(clause)) return false;
    // Limited serving offers can be advertised at the regular price. Require
    // an actual serving statement and a local date, not a distant music date.
    const datedServingOffer = /\b(?:breakfast|brunch|lunch|dinner|meal)\b.{0,40}\b(?:served|serving|available)\b.{0,40}\b(?:today|tonight|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/.test(clause);
    const datedDrinkFeature = /\b(?:today|tonight|this\s+(?:evening|afternoon|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/.test(clause) &&
      /\b(?:feature[ds]?\s+(?:\w+\s+){0,2}(?:cocktails?|drinks?|beer|wine)|(?:cocktails?|drinks?|beer|wine)\s+(?:\w+\s+){0,2}feature[ds]?)\b/.test(clause);
    if ((datedServingOffer || datedDrinkFeature) &&
        !/\b(?:regular\s+menu|usual\s+menu|lodging|accommodations?|room\s+rates?|overnight\s+stay|fundraiser|fundraising|community\s+(?:meal|dinner)|registration|workshop|class)\b/.test(clause)) return true;
    if (/\bregular\s+price\b/.test(clause) && !offer.test(clause)) return false;
    if (pricedFood.test(clause)) return true;
    return [...clause.matchAll(food)].some((foodMatch) => {
      // Bound context so a distant shopping/service offer does not attach to food.
      const start = Math.max(0, foodMatch.index - 64);
      const end = foodMatch.index + foodMatch[0].length + 64;
      const context = clause.slice(start, end).replace(/\bspecial\s+(?:guests?|gifts?|thanks|occasions?)\b/g, '');
      if (/\b(?:lodging|accommodations?|room\s+rates?|overnight\s+stay|retail|gift\s+shop)\b/.test(context)) return false;
      return offer.test(context);
    });
  });
  return { hasAny };
}
