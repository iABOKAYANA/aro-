import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const calculators = defineMessages({
  // Screen titles (also used by _layout.tsx)
  'calculators.mortgage': ['Mortgage calculator', 'حاسبة التمويل'],
  'calculators.investment': ['Investment calculator', 'حاسبة الاستثمار'],
  'calculators.estimator': ['Price estimator', 'مقدّر السعر'],
  'calculators.investmentTitle': ['Investment', 'الاستثمار'],

  // src/app/mortgage.tsx
  'calculators.bankMortgage': ['Bank mortgage', 'تمويل بنكي'],
  'calculators.mortgageIntro': [
    'Type your numbers below — the results update as you type.',
    'اكتب أرقامك تحت والنتايج هتتحسب لوحدها أول بأول.',
  ],
  'calculators.hintPrice': [
    'Full price of the unit, example: 8,500,000',
    'سعر الشقة كامل، مثال: 8,500,000',
  ],
  'calculators.hintDown': ['Cash you pay now, example: 20%', 'المقدم اللي هتدفعه كاش، مثال: 20%'],
  'calculators.hintTerm': [
    'How many years you will pay, example: 15',
    'هتقسّط على كام سنة، مثال: 15',
  ],
  'calculators.hintRate': [
    'Bank yearly interest, example: 19%',
    'فايدة البنك في السنة، مثال: 19%',
  ],
  'calculators.hintFees': [
    'Bank paperwork + insurance, paid once — example: 2%',
    'مصاريف البنك والتأمين، بتتدفع مرة واحدة — مثال: 2%',
  ],
  'calculators.hintDevDown': [
    'Cash you pay the developer now, example: 10%',
    'المقدم اللي هتدفعه للمطوّر كاش، مثال: 10%',
  ],
  'calculators.hintDevTerm': [
    'Developer plan length, 0% interest — example: 8 years',
    'مدة تقسيط المطوّر من غير فوايد — مثال: 8 سنين',
  ],
  'calculators.resultsHint': [
    'Your monthly payment, all the interest you will pay, and the loan share of the price.',
    'قسطك كل شهر، ومجموع الفوايد اللي هتدفعها، ونسبة القرض من سعر الشقة.',
  ],
  'calculators.loanHint': [
    'The loan is the price minus your down payment — this is what the bank pays for you.',
    'القرض هو السعر ناقص المقدم — ده المبلغ اللي البنك بيموّله ليك.',
  ],
  'calculators.compareHint': [
    'Same unit, three ways to pay — pick the cheapest total.',
    'نفس الشقة بتلات طرق دفع — اختار أرخص إجمالي.',
  ],
  'calculators.cheapestNote': [
    'The gold badge marks the cheapest total — cash usually wins because there is no interest.',
    'العلامة الدهبي يعني أرخص إجمالي — الكاش غالبًا بيكسب عشان مفيش فوايد.',
  ],
  'calculators.devPlanHint': [
    'Developer plans have 0% interest — the rest is split evenly over the months.',
    'تقسيط المطوّر من غير فوايد — الباقي بيتقسّم بالتساوي على الشهور.',
  ],
  'calculators.scheduleHint': [
    'Month by month: how much of each payment is interest and how much pays down the loan.',
    'شهر بشهر: كل قسط فيه كام فوايد وكام بيتخصم من القرض.',
  ],
  'calculators.propertyPrice': ['Property price', 'سعر العقار'],
  'calculators.pricePlaceholder': ['8,500,000', '8,500,000'],
  'calculators.downPaymentPct': ['Down payment %', 'نسبة المقدم %'],
  'calculators.preset5': ['5 yrs', '5 سنين'],
  'calculators.preset10': ['10 yrs', '10 سنين'],
  'calculators.preset15': ['15 yrs', '15 سنة'],
  'calculators.preset20': ['20 yrs', '20 سنة'],
  'calculators.termYears': ['Term (years)', 'المدة (سنوات)'],
  'calculators.ratePct': ['Annual interest rate %', 'نسبة الفائدة السنوية %'],
  'calculators.yourLoan': ['Your loan', 'القرض بتاعك'],
  'calculators.amountFinanced': ['Amount financed', 'المبلغ المموّل'],
  'calculators.monthlyInstallment': ['Monthly installment', 'القسط الشهري'],
  'calculators.estimate': ['Estimate', 'تقديري'],
  'calculators.totalRepaid': ['Total repaid over the term', 'إجمالي المدفوع طول المدة'],
  'calculators.interestCost': ['Interest cost', 'تكلفة الفوائد'],
  'calculators.devPlan': ['Developer installment plan', 'خطة التقسيط من المطوّر'],
  'calculators.devDownPct': ['Developer down payment %', 'نسبة المقدم للمطوّر %'],
  'calculators.planTerm': ['Plan term (years)', 'مدّة الخطة (سنوات)'],
  'calculators.planTotal': ['Total across the plan', 'الإجمالي طول الخطة'],
  'calculators.mortgageDisclaimer': [
    'Estimates only — bank rates, insurance and fees vary by lender and by applicant. Confirm the final figures with your bank.',
    'تقديرات بس — نسب البنوك والتأمين والرسوم بتختلف من بنك لآخر ومن عميل لعميل. أكّد الأرقام النهائية مع بنكك.',
  ],

  // CBE mortgage-initiative presets (مبادرة التمويل العقاري) — indicative figures only
  'calculators.cbeTitle': ['Central Bank initiatives', 'مبادرات البنك المركزي'],
  'calculators.cbePresetFree': ['Custom', 'حر'],
  'calculators.cbePreset3': ['3% · 30 yrs', '3% متناقصة · 30 سنة'],
  'calculators.cbePreset8': ['8% · 25 yrs', '8% متناقصة · 25 سنة'],
  'calculators.cbeHintFree': [
    'Your own rate and term — edit freely.',
    'فايدتك ومدتك اللي انت كاتبها — عدّل براحتك.',
  ],
  'calculators.cbeHint3': [
    '3% initiative for low income, within the initiative price caps — indicative terms, your bank confirms.',
    'مبادرة الـ3% لمحدودي الدخل لحد سعر وشروط المبادرة — شروط استرشادية، البنك يأكد.',
  ],
  'calculators.cbeHint8': [
    '8% initiative for middle income, within the initiative price caps — indicative terms, your bank confirms.',
    'مبادرة الـ8% لمتوسطي الدخل لحد سعر وشروط المبادرة — شروط استرشادية، البنك يأكد.',
  ],
  'calculators.cbeLine3': [
    '3% reducing rate over 30 years for low-income units inside the initiative.',
    'مبادرة الـ3% المتناقصة على 30 سنة لشقق محدودي الدخل اللي داخلة في المبادرة.',
  ],
  'calculators.cbeLine8': [
    '8% reducing rate over 25 years for middle-income units inside the initiative.',
    'مبادرة الـ8% المتناقصة على 25 سنة لشقق متوسطي الدخل اللي داخلة في المبادرة.',
  ],
  'calculators.cbeDisclaimer': [
    'Indicative terms — ask your bank about the final conditions.',
    'شروط استرشادية — اسأل البنك عن الشروط النهائية.',
  ],

  // Headline stats + the loan-fees input the website's calculator has
  'calculators.loanFeesPct': [
    'Loan fees (admin + insurance) %',
    'رسوم القرض (إداري + تأمين) %',
  ],
  'calculators.loanFees': ['Loan fees', 'رسوم القرض'],
  'calculators.ltv': ['Loan share of the price', 'نسبة القرض من سعر العقار'],
  'calculators.totalInterest': ['Total interest', 'إجمالي الفوائد'],

  // 3-way comparison table (Cash / Developer / Bank)
  'calculators.compareOptions': ['Compare your options', 'قارن بين الخيارات'],
  'calculators.cheapest': ['CHEAPEST', 'الأرخص'],
  'calculators.cashPurchase': ['Cash purchase', 'شراء كاش'],
  'calculators.cashNote': ['Pay the full price', 'تدفع المبلغ كله'],
  'calculators.upfront': ['Upfront', 'المقدم'],
  'calculators.monthly': ['Monthly', 'القسط الشهري'],
  'calculators.totalCost': ['Total cost', 'إجمالي التكلفة'],
  'calculators.totalFees': ['Total fees', 'إجمالي الرسوم'],
  // The table's notes are built from the inputs, so the words live here too
  'calculators.downWord': ['down', 'مقدم'],
  'calculators.downOver': ['down over', 'مقدم على'],
  'calculators.yearsWord': ['years', 'سنة'],
  'calculators.zeroInterest': ['years, 0% interest', 'سنة، فائدة 0%'],

  // Amortisation schedule
  'calculators.showSchedule': [
    'Show month-by-month payment table',
    'اعرض جدول الأقساط شهر بشهر',
  ],
  'calculators.hideSchedule': [
    'Hide month-by-month payment table',
    'إخفي جدول الأقساط شهر بشهر',
  ],
  'calculators.schedPayment': ['Payment', 'القسط'],
  'calculators.schedInterest': ['Interest', 'الفائدة'],
  'calculators.schedPrincipal': ['Principal', 'أصل القرض'],
  'calculators.schedBalance': ['Balance', 'الرصيد'],

  // src/app/investment.tsx
  'calculators.investDetails': ['Investment details', 'تفاصيل الاستثمار'],
  'calculators.investIntro': [
    'Type the price and the rent — your profit numbers update as you type.',
    'اكتب السعر والإيجار — أرقام المكسب بتتحسب لوحدها وأنت بتكتب.',
  ],
  'calculators.hintInvestPrice': [
    'Full price of the unit, example: 10,000,000',
    'سعر الشقة كامل، مثال: 10,000,000',
  ],
  'calculators.hintInvestDown': [
    'Cash you pay now, example: 10%',
    'المقدم اللي هتدفعه كاش، مثال: 10%',
  ],
  'calculators.hintInvestYears': [
    'How many years you will pay, example: 7',
    'هتقسّط على كام سنة، مثال: 7',
  ],
  'calculators.hintInvestRent': [
    'Yearly rent you expect — leave empty and we guess 8% of the price',
    'الإيجار السنوي اللي متوقعه — سيبه فاضي وهنحسب 8% من السعر',
  ],
  'calculators.yieldHint': [
    'Yearly rent as a share of the price — higher means better rental income.',
    'الإيجار السنوي بالنسبة لسعر الشقة — كل ما يعلى يبقى الدخل أحسن.',
  ],
  'calculators.cashHint': [
    'Yearly rent as a share of the cash you paid — your return on the down payment.',
    'الإيجار السنوي بالنسبة للمقدم اللي دفعته — ده العائد على فلوسك.',
  ],
  'calculators.netHint': [
    'What is left from the rent after the installment — green means you gain.',
    'اللي بيفضل من الإيجار بعد القسط — الأخضر يعني بتكسب.',
  ],
  'calculators.installmentYears': ['Installment years', 'سنوات التقسيط'],
  'calculators.expectedRent': ['Expected annual rent', 'الإيجار السنوي المتوقع'],
  'calculators.rentBlank': ['blank = 8% of price', 'سيبه فاضي = 8% من السعر'],
  'calculators.auto': ['Auto', 'أوتوماتيك'],
  'calculators.financing': ['Financing', 'التمويل'],
  'calculators.downPayment': ['Down payment', 'المقدم'],
  'calculators.rentalReturn': ['Rental return', 'عائد الإيجار'],
  'calculators.monthlyRent': ['Monthly rent income', 'دخل الإيجار الشهري'],
  'calculators.rentalYield': ['Yearly rent vs price', 'الإيجار السنوي بالنسبة للسعر'],
  'calculators.cashOnCash': ['Yearly rent vs your down payment', 'الإيجار السنوي بالنسبة للمقدم'],
  'calculators.netMonthly': ['Net monthly (rent − installment)', 'الصافي الشهري (إيجار − قسط)'],
  'calculators.projection': ['Projection', 'التوقعات'],
  'calculators.rental5': ['5-year rental income', 'دخل الإيجار 5 سنين'],
  'calculators.rental10': ['10-year rental income', 'دخل الإيجار 10 سنين'],
  'calculators.value5': ['Value in 5 years (+8%/yr)', 'القيمة بعد 5 سنين (+8% في السنة)'],
  'calculators.value10': ['Value in 10 years (+8%/yr)', 'القيمة بعد 10 سنين (+8% في السنة)'],
  'calculators.investNote': [
    'Estimates only — assumes 8% annual appreciation, no vacancy, fees, taxes or financing interest. Past growth does not guarantee future growth.',
    'تقديرات بس — مبنية على زيادة 8% سنويًا، من غير فراغ ولا رسوم ولا ضرائب ولا فوائد تمويل. النمو اللي فات مش ضمان لنمو جاي.',
  ],
  'calculators.enterPrice': [
    'Enter a property price to see the numbers.',
    'دخل سعر عقار عشان تشوف الأرقام.',
  ],

  // src/app/price-estimator.tsx
  'calculators.propertyDetails': ['Property details', 'بيانات العقار'],
  'calculators.estimatorIntro': [
    'Type the area, rooms and place — we guess the market price from similar units.',
    'اكتب المساحة والأوض والمكان — وهنخمّن سعر السوق من وحدات شبهها.',
  ],
  'calculators.hintArea': [
    'Unit size in square meters, example: 150',
    'مساحة الشقة بالمتر، مثال: 150',
  ],
  'calculators.hintBedrooms': ['Pick the number of rooms, or Any', 'اختار عدد الأوض، أو سيبها أي عدد'],
  'calculators.hintLocation': [
    'Area or compound name, example: New Cairo',
    'اسم المنطقة أو الكمبوند، مثال: القاهرة الجديدة',
  ],
  'calculators.estValueHint': [
    'Our guess for today — the range below is where the real price usually lands.',
    'تخمينّا لسعر النهاردة — والنطاق اللي تحت ده السعر الحقيقي غالبًا بيكون جواه.',
  ],
  'calculators.comparablesHint': [
    'Real units with a close size — tap one to open it.',
    'وحدات حقيقية بمساحة قريبة — دوس على واحدة عشان تفتحها.',
  ],
  'calculators.areaSqm': ['Area (m²)', 'المساحة (م²)'],
  'calculators.areaExample': ['e.g. 150', 'مثال: 150'],
  'calculators.bedrooms': ['Bedrooms', 'غرف النوم'],
  'calculators.any': ['Any', 'أي عدد'],
  'calculators.location': ['Location', 'الموقع'],
  'calculators.locationExample': ['e.g. New Cairo', 'مثال: القاهرة الجديدة'],
  'calculators.estimating': ['Estimating…', 'جاري التقدير…'],
  'calculators.estimatePrice': ['Estimate price', 'قدّر السعر'],
  'calculators.estValue': ['Estimated market value', 'القيمة السوقية المقدّرة'],
  'calculators.range': ['Range', 'النطاق'],
  'calculators.perSqm': ['per m²', 'للمتر المربع'],
  'calculators.factors': ['Valuation factors', 'عوامل التقييم'],
  'calculators.factorLocation': ['Location premium', 'علاوة الموقع'],
  'calculators.standard': ['Standard', 'قياسي'],
  'calculators.factorBedrooms': ['Bedroom multiplier', 'مضاعف غرف النوم'],
  'calculators.br': ['BR', 'غرفة'],
  'calculators.marketTrend': ['Market trend', 'اتجاه السوق'],
  'calculators.stable': ['Stable (+3% YoY)', 'مستقر (+3% سنويًا)'],
  'calculators.comparables': ['Comparable properties', 'وحدات مشابهة'],
  'calculators.estimatorNote': [
    'A quick heuristic, not a valuation — condition, floor, view and finish move the real price. Confirm with a broker before you commit.',
    'تقدير سريع مش تقييم رسمي — الحالة والدور والتشطيب والمنظر بيغيّروا السعر الحقيقي. اتأكد مع وسيط قبل ما تقرر.',
  ],
  'calculators.estError': [
    'Estimate shown without comparables — the server is unreachable.',
    'التقدير ظاهر من غير مقارنات — السيرفر مش متاح.',
  ],
});
