import { defineMessages } from '../define';

// Voice notes on leads. Owned by that feature.
export const vn = defineMessages({
  'vn.title': ['Voice note', 'ملاحظة صوتية'],
  'vn.section': ['Voice notes', 'ملاحظات صوتية'],
  'vn.record': ['Record', 'سجّل'],
  'vn.stop': ['Stop', 'قف'],
  'vn.stopAndSend': ['Stop & send', 'قف وابعت'],
  'vn.cancel': ['Cancel', 'إلغاء'],
  'vn.uploading': ['Sending…', 'بنبعت…'],
  'vn.retry': ['Try again', 'حاول تاني'],
  'vn.delete': ['Delete', 'امسح'],
  'vn.deleteConfirm': ['Delete this voice note?', 'تمسح الملاحظة الصوتية دي؟'],
  'vn.maxHint': ['Max 2 minutes per note', 'أقصى حاجة دقيقتين للملاحظة'],
  'vn.empty': ['No voice notes yet', 'لسه مفيش ملاحظات صوتية'],
  'vn.micDenied': [
    'Microphone is blocked — allow it from the phone settings and try again.',
    'الميك مقفول — افتحه من إعدادات الموبايل وحاول تاني.',
  ],
  'vn.recFailed': ['Could not record. Try again.', 'معرفناش نسجّل. حاول تاني.'],
  'vn.uploadFailed': ['Sending failed. Try again.', 'البعت فشل. حاول تاني.'],
  'vn.deleteFailed': ['Could not delete. Try again.', 'معرفناش نمسح. حاول تاني.'],
  'vn.playFailed': ['Could not play this note.', 'معرفناش نشغّل الملاحظة دي.'],
  'vn.play': ['Play', 'شغّل'],
  'vn.pause': ['Pause', 'وقف'],
});
