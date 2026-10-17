import { defineMessages } from '../define';

// "What can I afford?" calculator. Owned by the affordability feature.
export const afford = defineMessages({
  'afford.title': ['What can I afford?', 'أقدر على إيه؟'],
  'afford.intro': [
    'Tell us your salary and current commitments and we work backwards to the most expensive home a bank would finance for you.',
    'قولّنا مرتبك والتزاماتك واحنا نحسب بالعكس أغلى شقة البنك ممكن يموّلك فيها.',
  ],
  'afford.income': ['Monthly income', 'الدخل الشهري'],
  'afford.incomePlaceholder': ['50,000', '50,000'],
  'afford.hintIncome': [
    'Your total take-home pay per month, before any deductions for loans.',
    'كل اللي بيدخلك في الشهر على بعضه، قبل ما تخصم أي أقساط.',
  ],
  'afford.commitments': ['Monthly commitments', 'الالتزامات الشهرية'],
  'afford.commitmentsPlaceholder': ['5,000', '5,000'],
  'afford.hintCommitments': [
    'Every fixed payment you already owe each month — other loans, cards, car installments.',
    'كل قسط ثابت بتدفعه كل شهر — قروض تانية أو كروت أو قسط عربية.',
  ],
  'afford.downPayment': ['Available down payment', 'المقدم المتاح'],
  'afford.downPlaceholder': ['500,000', '500,000'],
  'afford.hintDown': [
    'Cash you can pay on day one — it is added on top of the loan, never borrowed.',
    'الكاش اللي هتدفعه في الأول — بيتزود على القرض، مش بيتستلف.',
  ],
  'afford.years': ['Max years', 'أقصى عدد سنين'],
  'afford.hintYears': [
    'How long you are willing to repay — longer means a bigger loan but more interest.',
    'هتسدد على كام سنة — كل ما المدة تطول القرض يكبر بس الفايدة تزيد.',
  ],
  'afford.rate': ['Annual interest rate (%)', 'الفايدة السنوية (%)'],
  'afford.hintRate': [
    'The bank rate used for the math — same starting point as the mortgage calculator.',
    'فايدة البنك اللي بنحسب بيها — نفس الرقم اللي حاسبة التمويل بتفتح بيه.',
  ],
  'afford.rule40': [
    'Banks lend up to 40% of your net income (income minus commitments).',
    'البنوك بتحسب لحد 40% من صافي دخلك (الدخل ناقص الالتزامات).',
  ],
  'afford.resultsHint': [
    'Worked backwards from what you can pay each month — same loan math as the mortgage calculator.',
    'محسوبة بالعكس من اللي تقدر تدفعه كل شهر — نفس حسبة القرض بتاعة حاسبة التمويل.',
  ],
  'afford.maxPrice': ['Max affordable price', 'أقصى سعر تقدر عليه'],
  'afford.hintMaxPrice': [
    'Your down payment plus the biggest loan your monthly installment can support.',
    'المقدم بتاعك زائد أكبر قرض القسط الشهري بتاعك يقدر يشيله.',
  ],
  'afford.monthly': ['Monthly installment', 'القسط الشهري'],
  'afford.hintMonthly': [
    '40% of what is left after your commitments — this is the number the bank looks at.',
    '40% من اللي بيفضل بعد التزاماتك — هو ده الرقم اللي البنك بيبص عليه.',
  ],
  'afford.downPct': ['Required down payment', 'المقدم المطلوب كنسبة'],
  'afford.hintDownPct': [
    'Your down payment as a share of the max price — banks usually want at least 10–20%.',
    'المقدم بتاعك كنسبة من أقصى سعر — البنوك غالبًا بتطلب 10–20% على الأقل.',
  ],
  'afford.matches': ['Where you can buy', 'تشتري فين بالسعر ده'],
  'afford.matchesHint': [
    'Projects whose starting price fits your budget — tap one to open it.',
    'مشاريع سعر البداية فيها على قد ميزانيتك — دوس على أي واحد يفتح.',
  ],
  'afford.loadingMatches': ['Finding projects in your budget…', 'بندور على مشاريع على قد ميزانيتك…'],
  'afford.matchesError': ['Could not load matching projects.', 'معرفناش نجيب المشاريع المناسبة.'],
  'afford.noMatch': ['Nothing fits this budget yet', 'مفيش حاجة على قد الميزانية دي لسه'],
  'afford.noMatchHint': [
    'Try more years, a lower area, or a bigger down payment — then check again.',
    'جرّب تزود السنين أو تدور في منطقة أرخص أو تكبّر المقدم — وبعدين بص تاني.',
  ],
  'afford.noBudget': ['No room for an installment', 'مفيش مكان لقسط'],

  'afford.noBudgetHint': [
    'Your commitments eat your whole income, so the affordable price is just your down payment in cash.',
    'التزاماتك واكلة دخلك كله، فسقفك هو المقدم بتاعك كاش بس من غير قرض.',
  ],
  'afford.enterInputs': ['Enter your numbers to see your budget', 'دخل أرقامك عشان تشوف ميزانيتك'],
  'afford.enterInputsHint': [
    'Your max price appears here as soon as income and down payment are filled in.',
    'أقصى سعر هيظهر هنا أول ما تدخل الدخل والمقدم.',
  ],
  'afford.rowHint': ['See the max home price your salary can finance', 'اعرف أغلى شقة مرتبك يقدر يموّلها'],
  'afford.disclaimer': [
    'Estimate only — banks also check credit history, age and the property itself before approving.',
    'دي حسبة استرشادية بس — البنوك بتبص كمان على الائتمان والسن والشقة نفسها قبل الموافقة.',
  ],
});
