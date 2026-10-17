import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const assistant = defineMessages({
  'assistant.title': ['Assistant', 'المساعد'],
  'assistant.introTitle': ['Ask Ayn anything about the market', 'اسأل عين أي حاجة عن السوق'],
  'assistant.introBody': [
    'Projects, prices, payment plans, mortgages or a comparison — the assistant reads the same live inventory the website does.',
    'مشروعات، أسعار، خطط سداد، قروض أو مقارنة — المساعد بيقرأ نفس البيانات الحيّة اللي الموقع بيقراها.',
  ],

  // Suggestion chips (also sent as the user's message when tapped)
  'assistant.suggestNewCairo': [
    '3-bedroom apartments in New Cairo under 10M',
    'شقق 3 غرف في التجمع الجديد بأقل من 10 مليون',
  ],
  'assistant.suggestNorthCoast': ['New launches in the North Coast', 'أحدث إطلاقات الساحل الشمالي'],
  'assistant.suggestCompare': ['Compare Sodic and Palm Hills', 'قارن بين سوديك وبالمس هيلز'],
  'assistant.suggestDownPayment': ['What down payment do I need?', 'محتاج كام مقدم؟'],

  // Composer + thread
  'assistant.placeholder': [
    'Ask about properties, projects, or payments…',
    'اسأل عن عقارات أو مشروعات أو طرق الدفع…',
  ],
  'assistant.thinking': ['Thinking…', 'فكر شوية…'],

  // Voice search — mic button beside the composer input (ar-EG dictation)
  'assistant.voiceLabel': ['Voice search', 'بحث صوتي'],
  'assistant.voiceListening': [
    'Listening… tap the mic to stop. Your words land in the box for review.',
    'بسمعك… دوس على المايك عشان توقف. كلامك هينزل في الخانة عشان تراجعه.',
  ],
  'assistant.voiceDenied': [
    'The mic is blocked — allow it in the browser settings to speak instead of typing.',
    'المايك مقفول — افتحه من إعدادات المتصفح عشان تتكلم بدل ما تكتب.',
  ],
  'assistant.voiceDeniedNative': [
    'The mic is blocked — allow it in the device settings to speak instead of typing.',
    'المايك مقفول — افتحه من إعدادات الموبايل عشان تتكلم بدل ما تكتب.',
  ],
  'assistant.voiceNoSpeech': [
    'I did not catch that — please try again.',
    'مسمعتكش كويس — حاول تاني.',
  ],
  'assistant.voiceUnavailable': [
    'Voice search is not on in this app build yet — use your keyboard mic for dictation, then review before sending.',
    'البحث الصوتي لسه مش شغال في نسخة التطبيق دي — استخدم علامة المايك في الكيبورد للإملاء، وراجع قبل ما تبعت.',
  ],
  'assistant.noAnswer': [
    'I could not answer that just now — please try again.',
    'مقدرتش أجاوب دلوقتي — جرب تاني.',
  ],
  'assistant.unavailable': ['The assistant is unavailable.', 'المساعد مش متاح دلوقتي.'],

  // Availability indicator — GET /api/ai/status, checked before the first message
  'assistant.statusChecking': ['Checking…', 'بنتأكد…'],
  'assistant.statusOnline': ['AI Online', 'المساعد شغال'],
  'assistant.statusOffline': ['AI Offline — Start Ollama', 'المساعد واقف — شغّل Ollama'],
  'assistant.offlineHint': [
    'You are offline — old messages still show, but new answers need internet. Pull down to retry.',
    'أنت أوفلاين — الرسايل القديمة ظاهرة، بس الردود الجديدة محتاجة نت. اسحب لتحت عشان تحاول تاني.',
  ],
  'assistant.quickLabel': [
    'Tap one to start — each sends a ready-made question.',
    'دوس على واحدة عشان تبدأ — كل واحدة بتبعت سؤال جاهز.',
  ],
  'assistant.suggestLabel': ['Or try an example question:', 'أو جرّب سؤال من دول:'],

  // Quick actions (the website's QUICK_ACTIONS chips): label, then the query
  // that gets sent when it is tapped.
  'assistant.quickApartments': ['Apartments', 'شقق'],
  'assistant.quickApartmentsQ': ['I want an apartment', 'عايز شقة'],
  'assistant.quickVillas': ['Villas', 'فلل'],
  'assistant.quickVillasQ': ['I want a villa', 'عايز فيلا'],
  'assistant.quickInvestment': ['Investment', 'استثمار'],
  'assistant.quickInvestmentQ': ['Something to invest in', 'عايز حاجة للاستثمار'],
  'assistant.quickLowDp': ['Lowest down payment', 'أقل مقدم'],
  'assistant.quickLowDpQ': ['Lowest down payment', 'أقل مقدم'],
  'assistant.quickReady': ['Ready', 'جاهز'],
  'assistant.quickReadyQ': ['Ready to move in', 'جاهز للاستلام'],
  'assistant.quickCompare': ['Compare', 'قارن'],
  'assistant.quickCompareQ': ['Compare projects', 'قارن المشاريع'],

  // property_grid block — the results panel
  'assistant.viewAll': ['View all', 'عرض كل'],
  'assistant.resultsCount': ['results', 'نتيجة'],
  'assistant.gridIntro': [
    'Real matches from the live catalogue — tap one to open it.',
    'نتايج حقيقية من الكتالوج — دوس على واحدة عشان تفتحها.',
  ],
  'assistant.compareIntro': [
    'Side-by-side comparison — same row, different projects.',
    'مقارنة جنب بعض — نفس الصف لمشاريع مختلفة.',
  ],
  'assistant.paymentIntro': [
    'How this unit would be paid — down payment, then installments.',
    'الوحدة دي هتتدفع إزاي — مقدم وبعدين أقساط.',
  ],
  'assistant.filterIntro': [
    'This is what I understood from your message.',
    'ده اللي فهمته من رسالتك.',
  ],

  // comparison block rows
  'assistant.cmpLocation': ['Location', 'الموقع'],
  'assistant.cmpFrom': ['From', 'يبدأ من'],
  'assistant.cmpTypes': ['Types', 'الأنواع'],
  'assistant.cmpUnits': ['Units', 'الوحدات'],
  'assistant.cmpCompletion': ['Completion', 'الإنجاز'],
  'assistant.cmpDownPayment': ['Down payment', 'المقدم'],
  'assistant.cmpInstallments': ['Installments', 'التقسيط'],
  'assistant.yearsWord': ['years', 'سنة'],
  'assistant.na': ['N/A', 'N/A'],

  // payment block rows
  'assistant.payDown': ['Down', 'مقدم'],
  'assistant.payFinanced': ['Financed', 'المموّل'],
  'assistant.paySemiAnnual': ['per semi-annual installment', '/ نصف سنوي'],
  'assistant.payMonthly': ['Approx. monthly', 'شهري تقريبي'],
  'assistant.payPerSqm': ['Price per m²', 'سعر المتر'],
});
