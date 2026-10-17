import { defineMessages } from '../define';

// Rent-vs-buy calculator. Owned by that feature.
export const rentbuy = defineMessages({
  'rentbuy.title': ['Rent or buy?', 'إيجار ولا شرا؟'],
  'rentbuy.intro': [
    'Type what you pay in rent and what the home costs — we compare total rent against buying costs over the same years and tell you which wins.',
    'اكتب إيجارك وسعر الشقة — وهنقارن إجمالي الإيجار بتكلفة الشِرا على نفس السنين ونقولك مين الكسبان.',
  ],
  'rentbuy.rent': ['Monthly rent now', 'الإيجار الشهري دلوقتي'],
  'rentbuy.rentPlaceholder': ['25,000', '25,000'],
  'rentbuy.hintRent': [
    'What you pay per month today, example: 25,000',
    'اللي بتدفعه في الشهر دلوقتي، مثال: 25,000',
  ],
  'rentbuy.price': ['Home price', 'سعر الشقة'],
  'rentbuy.pricePlaceholder': ['8,500,000', '8,500,000'],
  'rentbuy.hintPrice': [
    'Full price of the home you would buy, example: 8,500,000',
    'سعر الشقة الكامل اللي ناوي تشتريها، مثال: 8,500,000',
  ],
  'rentbuy.down': ['Down payment (cash)', 'المقدم (كاش)'],
  'rentbuy.downPlaceholder': ['1,700,000', '1,700,000'],
  'rentbuy.hintDown': [
    'Cash you pay on day one — the loan covers the rest, never the other way round.',
    'الكاش اللي هتدفعه في الأول — والقرض يكمّل الباقي، مش العكس.',
  ],
  'rentbuy.years': ['Compare over (years)', 'نقارن على كام سنة'],
  'rentbuy.hintYears': [
    'The window you compare on — the loan runs the same years, same starting point as the mortgage calculator: 15.',
    'المدة اللي بتقارن عليها — والقرض ماشي على نفس السنين، نفس الرقم اللي حاسبة التمويل بتفتح بيه: 15.',
  ],
  'rentbuy.rate': ['Annual interest rate (%)', 'الفايدة السنوية (%)'],
  'rentbuy.hintRate': [
    'The bank rate for the loan — same starting point as the mortgage calculator: 19%.',
    'فايدة البنك على القرض — نفس الرقم اللي حاسبة التمويل بتفتح بيه: 19%.',
  ],
  'rentbuy.rentGrowth': ['Yearly rent increase (%)', 'زيادة الإيجار كل سنة (%)'],
  'rentbuy.hintRentGrowth': [
    'How much your rent climbs each year — 10% is a cautious Cairo guess.',
    'إيجارك بيزيد قد إيه كل سنة — 10% تخمين حذر للقاهرة.',
  ],
  'rentbuy.appreciation': ['Yearly home price increase (%)', 'زيادة سعر الشقة كل سنة (%)'],
  'rentbuy.hintAppreciation': [
    'How much the home value climbs each year — shown for info only, never subtracted from what you pay.',
    'سعر الشقة بيزيد قد إيه كل سنة — للعِلم بس، مش بنخصمه من اللي هتدفعه.',
  ],
  'rentbuy.resultsHint': [
    'Out of pocket against out of pocket — the home value below is info only.',
    'جيب قصاد جيب — قيمة الشقة اللي تحت للعِلم بس.',
  ],
  'rentbuy.monthly': ['Monthly installment', 'القسط الشهري'],
  'rentbuy.hintMonthly': [
    'Same annuity math as the mortgage calculator — flat every month till the loan ends with the window.',
    'نفس حسبة القسط بتاعة حاسبة التمويل — ثابت كل شهر لحد ما القرض يخلص مع آخر المدة.',
  ],
  'rentbuy.totalRent': ['Total rent paid', 'إجمالي الإيجار المدفوع'],
  'rentbuy.hintTotalRent': [
    'Every month of rent added up, growing a little each year.',
    'كل شهور الإيجار متجمّعة، وبتزيد حبة كل سنة.',
  ],
  'rentbuy.outOfPocket': ['Total buying out of pocket', 'إجمالي اللي هتدفعه في الشِرا'],
  'rentbuy.hintOutOfPocket': [
    'Down payment plus every installment inside these years — nothing subtracted.',
    'المقدم زائد كل الأقساط جوه المدة دي — من غير ما نخصم حاجة.',
  ],
  'rentbuy.homeValue': ['Est. home value at the end', 'قيمة الشقة المتوقعة في الآخر'],
  'rentbuy.hintHomeValue': [
    'What the home could be worth after these years — for your eyes only, not part of the verdict.',
    'الشقة ممكن تسوى كام بعد المدة دي — عشان تبقى عارف بس، مش داخلة في الحكم.',
  ],
  'rentbuy.verdictBuy': [
    'Buying wins — less money leaves your pocket',
    'الشِرا يكسب — فلوس أقل هتطلع من جيبك',
  ],
  'rentbuy.verdictRent': [
    'Renting wins — less money leaves your pocket',
    'الإيجار يكسب — فلوس أقل هتطلع من جيبك',
  ],
  'rentbuy.verdictTie': [
    'Almost tied — the difference is pocket change',
    'تقريبًا متعادلين — الفرق فكة',
  ],
  'rentbuy.breakevenAtYear': ['Breakeven in year', 'التعادل في سنة'],
  'rentbuy.hintBreakeven': [
    'The first year buying gets cheaper than renting — counted from today.',
    'أول سنة الشِرا يبقى أرخص فيها من الإيجار — محسوبة من النهاردة.',
  ],
  'rentbuy.breakevenBeyond': [
    'No breakeven inside these years — renting stays cheaper to the end',
    'مفيش تعادل جوه المدة دي — الإيجار أرخص لحد الآخر',
  ],
  'rentbuy.savedByBuying': ['You keep by buying', 'هتوفرها لو اشتريت'],
  'rentbuy.savedByRenting': ['You keep by renting', 'هتوفرها لو أجّرت'],
  'rentbuy.enterInputs': ['Enter rent and price to see the verdict', 'دخل الإيجار والسعر عشان تشوف الحكم'],
  'rentbuy.enterInputsHint': [
    'The comparison appears here as soon as monthly rent and home price are filled in.',
    'المقارنة هتظهر هنا أول ما تدخل الإيجار الشهري وسعر الشقة.',
  ],
  'rentbuy.rowHint': [
    'Rent or buy? Compare both roads and find your breakeven year',
    'إيجار ولا شرا؟ قارن الطريقين واعرف سنة التعادل',
  ],
  'rentbuy.disclaimer': [
    'Estimate only — maintenance, taxes, fees and moving costs are not counted on either side.',
    'دي حسبة استرشادية بس — الصيانة والضرايب والرسوم ومصاريف النقل مش محسوبة على أي جنب.',
  ],
});
