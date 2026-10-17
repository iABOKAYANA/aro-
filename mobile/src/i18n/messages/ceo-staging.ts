import { defineMessages } from '../define';

// CEO WhatsApp staging inbox + developer edit-request review queue.
// Own file so the pipeline surface can ship without touching the shared
// ceo/developer tables (a sibling builds the website twin in parallel).
export const ceoStaging = defineMessages({
  // ── WhatsApp staging inbox (GET/PATCH /api/ceo/staging) ──
  'ceoSt.stagingTitle': ['WhatsApp inbox', 'وارد الواتساب'],
  'ceoSt.stagingHint': [
    'Messages from WhatsApp groups land here — approve them into projects, merge them into an existing one, or reject.',
    'رسايل جروبات الواتساب بتنزل هنا — وافق عليها عشان تبقى مشاريع، أو ادمجها في مشروع موجود، أو ارفضها.',
  ],
  'ceoSt.searchGroup': ['Search group or sender…', 'دوّر على الجروب أو المرسل…'],
  'ceoSt.navHint': [
    'WhatsApp messages awaiting review.',
    'رسايل الواتساب اللي مستنية المراجعة.',
  ],
  'ceoSt.noSender': ['Unknown sender', 'مرسل مش معروف'],
  'ceoSt.rawMessage': ['Message', 'الرسالة'],
  'ceoSt.extracted': ['Understood', 'اللي اتفهم'],
  'ceoSt.photos': ['photos', 'صور'],
  'ceoSt.matchScore': ['match', 'التطابق'],
  'ceoSt.suggested': ['Suggested project', 'المشروع المقترح'],
  'ceoSt.noPayload': [
    'No readable content in this message.',
    'مفيش محتوى مقروء في الرسالة دي.',
  ],
  'ceoSt.reviewedNote': ['Review note', 'ملاحظة المراجعة'],
  'ceoSt.reasonLabel': [
    'Reason / note (required to reject)',
    'السبب / ملاحظة (إجباري للرفض)',
  ],
  'ceoSt.nameOverride': [
    'Project name override (required when missing)',
    'اسم المشروع (إجباري لو ناقص)',
  ],
  'ceoSt.developerPick': [
    'Owner developer (optional — auto-matched by phone)',
    'المطوّر المالك (اختياري — بيتجاب من التليفون لوحده)',
  ],
  'ceoSt.targetField': ['Target project ID', 'كود المشروع الهدف'],
  'ceoSt.targetHint': [
    'Paste the project ID, or tap the suggestion when there is one.',
    'الصق كود المشروع، أو دوس على الاقتراح لو موجود.',
  ],
  'ceoSt.targetRequired': ['Pick a target project first.', 'اختار المشروع الهدف الأول.'],
  'ceoSt.reasonRequired': ['Write the reason first.', 'اكتب السبب الأول.'],
  'ceoSt.approveTitle': ['Approve this message?', 'نوافق على الرسالة دي؟'],
  'ceoSt.approveBody': [
    'A new project is created from it with APPROVED status — publishing still goes through the normal step.',
    'هيتعمل منها مشروع جديد بحالة APPROVED — والنشر لسه بخطوته العادية.',
  ],
  'ceoSt.mergeTitle': ['Merge into a project?', 'ندمجها في مشروع؟'],
  'ceoSt.mergeBody': [
    'Its details are applied onto the target project — filled fields are never overwritten.',
    'تفاصيلها هتتطبق على المشروع الهدف — الحقول المليانة مش بتتبدل.',
  ],
  'ceoSt.rejectTitle': ['Reject this message?', 'نرفض الرسالة دي؟'],
  'ceoSt.rejectBody': [
    'It is marked rejected with your reason.',
    'هتتعلم مرفوضة بالسبب بتاعك.',
  ],
  'ceoSt.approvedOk': ['Project created from message', 'اتعمل مشروع من الرسالة'],
  'ceoSt.mergedOk': ['Merged into project', 'اتدمجت في المشروع'],
  'ceoSt.rejectedOk': ['Message rejected', 'الرسالة اترفضت'],
  'ceoSt.empty': ['Nothing here', 'مفيش حاجة هنا'],
  'ceoSt.emptyHint': [
    'New WhatsApp messages will queue up here.',
    'رسايل الواتساب الجديدة هتتجمّع هنا.',
  ],

  // ── Developer edit-request inbox (GET/PATCH /api/ceo/edit-requests) ──
  'ceoSt.reqTitle': ['Edit requests', 'طلبات التعديل'],
  'ceoSt.reqHint': [
    'Field changes developers asked for — approving applies them right away.',
    'تعديلات الحقول اللي المطوّرين طلبوها — الموافقة بتطبقها على طول.',
  ],
  'ceoSt.reqEmpty': ['No requests with this status', 'مفيش طلبات بالحالة دي'],
  'ceoSt.reqShow': ['Show edit requests', 'اعرض طلبات التعديل'],
  'ceoSt.reqHide': ['Hide edit requests', 'اخفي طلبات التعديل'],
  'ceoSt.reqApproveTitle': ['Approve and apply?', 'نوافق ونطبّق؟'],
  'ceoSt.reqApproveBody': [
    'The new value is written onto the live record right away.',
    'القيمة الجديدة هتتكتب على السجل على طول.',
  ],
  'ceoSt.reqRejectTitle': ['Reject this request?', 'نرفض الطلب ده؟'],
  'ceoSt.reqRejectBody': [
    'The developer is notified with your reason.',
    'المطوّر هيتبلّغ بالسبب بتاعك.',
  ],
  'ceoSt.reqNote': [
    'Reply note (sent to the developer)',
    'ملاحظة الرد (بتتبعت للمطوّر)',
  ],
  'ceoSt.reqApprovedOk': ['Applied', 'اتطبّق'],
  'ceoSt.reqRejectedOk': ['Request rejected', 'الطلب اترفض'],
  'ceoSt.oldValue': ['Was', 'كان'],
  'ceoSt.newValue': ['Becomes', 'هيبقى'],

  // ── Developer edit permission (PATCH /api/ceo/developers/[id] editMode) ──
  'ceoSt.editModeLabel': ['Edit permission', 'صلاحية التعديل'],
  'ceoSt.editDirect': ['Direct', 'مباشر'],
  'ceoSt.editRequest': ['By request', 'بطلب'],
  'ceoSt.editModeHint': [
    'REQUEST blocks direct edits — the developer sends requests instead.',
    'الـ REQUEST بيمنع التعديل المباشر — المطوّر بيبعت طلبات بدل كده.',
  ],
  'ceoSt.editModeUpdated': ['Permission updated', 'اتحدّثت الصلاحية'],
});
