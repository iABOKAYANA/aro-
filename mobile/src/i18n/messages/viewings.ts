import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const viewings = defineMessages({
  // List screen — src/app/viewings.tsx
  'viewings.mine': ['My appointments', 'مواعيدي'],
  'viewings.book': ['Book a viewing', 'احجز معاينة'],
  'viewings.loading': ['Loading your appointments…', 'جاري تحميل مواعيدك…'],
  'viewings.empty': ['No appointments yet', 'مفيش مواعيد لسه'],
  'viewings.emptyHint': [
    'Book a viewing from any project page — in person at the sales gallery, or online with a free video room.',
    'احجز معاينة من صفحة أي مشروع — في معرض المبيعات، أو أونلاين بغرفة فيديو مجانية.',
  ],
  'viewings.findProject': ['Find a project', 'دوّر على مشروع'],
  'viewings.property': ['Property', 'عقار'],
  'viewings.onlineMeeting': ['Online meeting', 'معاينة أونلاين'],
  'viewings.inPerson': ['In-person viewing', 'معاينة في المكان'],
  'viewings.minutes': ['minutes', 'دقيقة'],
  'viewings.joinRoom': ['Join the video room', 'ادخل غرفة الفيديو'],
  'viewings.opensBrowser': ['Opens in your browser', 'هيفتح في المتصفح'],
  'viewings.contactNumber': ['Contact number', 'رقم للتواصل'],
  'viewings.openProject': ['Open project', 'افتح المشروع'],
  'viewings.cancelling': ['Cancelling…', 'جاري الإلغاء…'],
  'viewings.cancelTitle': ['Cancel appointment?', 'نلغي الموعد؟'],
  'viewings.cancelBody': [
    'this cannot be undone, but you can book again.',
    'مش هتقدر ترجعه تاني، بس تقدر تحجز من جديد.',
  ],
  'viewings.keepIt': ['Keep it', 'سيبها'],
  'viewings.cancelIt': ['Cancel it', 'إلغاء'],
  'viewings.cancelFailed': ['Could not cancel', 'مقدرناش نلغي'],
  'viewings.upcoming': ['Upcoming', 'القادمة'],
  'viewings.past': ['Past', 'الماضية'],
  'viewings.copyLink': ['Copy Link', 'انسخ اللينك'],
  'viewings.copied': ['Copied', 'اتنسخ'],
  'viewings.copyFailed': ['Could not copy the link', 'مقدرناش ننسخ اللينك'],
  'viewings.with': ['with', 'مع'],
  'viewings.signIn': ['Sign in to see your appointments', 'سجّل دخول عشان تشوف مواعيدك'],
  'viewings.emptyUpcoming': ['No upcoming appointments', 'مفيش مواعيد جاية'],
  'viewings.emptyUpcomingHint': [
    'Open any project and book a viewing to schedule one.',
    'افتح أي مشروع واحجز معاينة عشان تحجز موعد.',
  ],
  'viewings.emptyPast': ['No past appointments', 'مفيش مواعيد خلصت'],
  'viewings.emptyPastHint': [
    'Your completed appointments will appear here.',
    'المواعيد اللي خلصت هتظهر هنا.',
  ],

  // Booking screen — src/app/viewing/book.tsx
  'viewings.booked': ['Booked', 'تم الحجز'],
  'viewings.requested': ['Appointment requested', 'طلب الموعد اتبعت'],
  'viewings.success': [
    'We received your request. The team will confirm it by phone — every booking also lands on the leads pipeline so someone picks it up quickly.',
    'استلمنا طلبك. الفريق هأكدلك بالتليفون — وكل حجز بيروح لفريق العملاء عشان حد يرد عليك بسرعة.',
  ],
  'viewings.when': ['When', 'الموعد'],
  'viewings.meetingLink': ['Meeting link', 'لينك الاجتماع'],
  'viewings.openLink': ['Open the meeting link', 'افتح لينك الاجتماع'],
  'viewings.done': ['Done', 'تمام'],
  'viewings.stepMeet': ['1 · How would you like to meet?', '1 · تحب نتقابل إزاي؟'],
  'viewings.inPersonChip': ['In person', 'في المكان'],
  'viewings.online': ['Online', 'أونلاين'],
  'viewings.hintOnline': [
    'A free video room is generated for you the moment the booking is created.',
    'غرفة فيديو مجانية هتتعملك أول ما الحجز يتعمل.',
  ],
  'viewings.hintInPerson': [
    'Visit the sales gallery and walk the project with an agent.',
    'زور معرض المبيعات واتفرج على المشروع مع المندوب.',
  ],
  'viewings.stepDay': ['2 · Pick a day', '2 · اختار يوم'],
  'viewings.stepTime': ['3 · Pick a time', '3 · اختار وقت'],
  'viewings.egyptTime': ['Egypt local time on', 'التوقيت المحلي في مصر يوم'],
  'viewings.chooseDayFirst': ['Choose a day first', 'اختار يوم الأول'],
  'viewings.stepDetails': ['4 · Your details', '4 · بياناتك'],
  'viewings.fullName': ['Full name', 'الاسم بالكامل'],
  'viewings.namePlaceholder': ['Ahmed Hassan', 'أحمد حسن'],
  'viewings.notesLabel': ['Anything we should know?', 'في حاجة لازم نعرفها؟'],
  'viewings.notesPlaceholder': [
    'Preferred floor, budget, timing…',
    'الدور المفضل، الميزانية، التوقيت…',
  ],
  'viewings.request': ['Request this appointment', 'اطلب الموعد ده'],
  'viewings.footnote': [
    'Booking needs no account — but signing in keeps every appointment in your dashboard.',
    'الحجز مش محتاج حساب — بس لو دخلت هتلاقي كل مواعيدك في لوحة التحكم.',
  ],
  'viewings.errNoProperty': [
    'No property selected for booking — reopen this from a project page.',
    'مفيش عقار متحدد للحجز — افتحها تاني من صفحة المشروع.',
  ],
  'viewings.errPickTime': ['Please pick a date and a time first.', 'اختار التاريخ والوقت الأول.'],
  'viewings.phonePlaceholder': ['01xxxxxxxxx', '01xxxxxxxxx'],
  'viewings.showingFirst': ['Showing first {n} appointments', 'عرض أول {n} من المواعيد'],
  'viewings.errSlotTaken': [
    'That time is not available — pick another slot.',
    'الوقت ده مش متاح — اختار وقت تاني.',
  ],
  'viewings.errName': ['Please tell us your name.', 'قولنا اسمك.'],
  'viewings.errPhone': [
    'Please enter a valid phone number (7–15 digits).',
    'اكتب رقم موبايل صحيح (من 7 لـ 15 رقم).',
  ],
  'viewings.errBookFailed': ['Could not book the appointment.', 'مقدرناش نحجز الموعد.'],
  // Booking progress dots + named confirmation (steps derive from real form state).
  'viewings.dotDay': ['Day', 'اليوم'],
  'viewings.dotTime': ['Time', 'الوقت'],
  'viewings.dotDetails': ['Details', 'بياناتك'],
  'viewings.successNamed': [
    'Booked, {name} ✓ — we will confirm with you on WhatsApp soon.',
    'اتسجلت يا {name} ✓ — هنأكد معاك على واتساب قريب.',
  ],
  'viewings.confirmWhatsApp': ['Confirm on WhatsApp', 'تأكيد واتساب'],
  'viewings.waConfirm': [
    'Hi {name} 👋\nYour viewing at {project} is booked for {date} at {time} ({type}).\nSee you then — reply here if you need to reschedule 🙏',
    'أهلاً {name} 👋\nمعاينتك في {project} متسجلة يوم {date} الساعة {time} ({type}).\nهنستناك، ولو عايز تغيّر المعاد رد على الرسالة دي 🙏',
  ],
});
