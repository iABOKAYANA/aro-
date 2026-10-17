import { defineMessages } from '../define';

// Owned by src/app/blog/index.tsx and src/app/blog/[slug].tsx
export const blog = defineMessages({
  'blog.title': ['Blog', 'المدونة'],
  'blog.subtitle': [
    'Real estate insights, market updates, and expert advice',
    'أخبار العقار وتحديثات السوق ونصائح من الخبراء',
  ],
  'blog.loading': ['Loading posts…', 'بنحمّل المقالات…'],
  'blog.loadingPost': ['Loading post…', 'بنحمّل المقال…'],
  'blog.empty': ['No blog posts available yet.', 'مفيش مقالات منشورة لسه.'],
  'blog.emptyHint': ['Check back soon for the latest updates.', 'ارجع تاني بعدين عشان آخر التحديثات.'],
  'blog.failed': ['Could not load posts.', 'مقدرناش نحمّل المقالات.'],
  'blog.loadMore': ['Load more', 'المزيد'],
  'blog.backToBlog': ['Back to Blog', 'رجوع للمدونة'],
  'blog.notFound': ['Post not found', 'المقال مش موجود'],
  'blog.tags': ['Tags', 'الوسوم'],
  'blog.by': ['By', 'بقلم'],
  'blog.readMore': ['Read more', 'اقرأ أكتر'],
  'blog.minRead': ['min read', 'دقايق قراءة'],
  'blog.related': ['Related posts', 'مقالات ليها علاقة'],
});

/**
 * Keys of this namespace as a type.
 *
 * `MessageKey` in `../index.tsx` (the shared, lead-owned provider) does not
 * list the `blog` table yet even though it merges it at runtime, so screens
 * widen `t` locally with this union instead of editing that file.
 */
export type BlogKey = keyof typeof blog;
