'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { X, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'

/* ─── Small API helper shared by the management pages ──── */

export async function ceoApi<T = Record<string, unknown>>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    // CSRF marker the middleware gate requires on cookie-authed mutations
    // (harmless on GETs). Mobile-style token auth is unaffected either way.
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}) as T)
  if (!res.ok) {
    const message =
      (data as { error?: string })?.error || `Request failed (${res.status})`
    console.error('CEO API error:', path, message)
    throw new Error(message)
  }
  return data as T
}

/* ─── Toast ─────────────────────────────────────────────── */

export type ToastState = { msg: string; tone: 'ok' | 'err' } | null

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => onCloseRef.current(), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex justify-end">
      <div
        className={cn(
          'pointer-events-auto flex max-w-sm items-start gap-3 rounded-3xl border px-4 py-3 shadow-2xl backdrop-blur-sm',
          toast.tone === 'ok'
            ? 'border-green-500/30 bg-green-950/90 text-green-100'
            : 'border-red-500/30 bg-red-950/90 text-red-100'
        )}
      >
        {toast.tone === 'ok' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        )}
        <p className="text-sm">{toast.msg}</p>
        <button
          onClick={onClose}
          className="ml-1 shrink-0 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label={ar ? 'اقفل' : 'Dismiss'}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ─── Modal ─────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const { lang: modalLang } = useLanguage()
  const modalAr = modalLang === 'ar'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative my-8 w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-6 shadow-2xl',
          className || 'max-w-lg'
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={modalAr ? 'اقفل' : 'Close'}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {children}

        {footer && (
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border dark:border-[#262626] pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Confirm dialog ────────────────────────────────────── */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  busy = false,
  confirmPhrase,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  confirmPhrase?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const inputId = useRef(`cf-${Math.random().toString(36).slice(2, 8)}`)
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const okLabel = confirmLabel ?? (ar ? 'أكّد' : 'Confirm')
  const cancelLabel = ar ? 'إلغاء' : 'Cancel'

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const ready = !confirmPhrase || typed === confirmPhrase

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy || !ready}
            className={
              tone === 'danger'
                ? 'bg-red-500/90 text-white hover:bg-red-500'
                : 'gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90'
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {okLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
            tone === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-estate-gold/10 text-estate-gold'
          )}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="text-sm text-gray-300">{message}</div>
      </div>

      {confirmPhrase && (
        <div className="mt-4">
          <label htmlFor={inputId.current} className="mb-1.5 block text-xs font-medium text-gray-400">
            {ar ? (
              <>اكتب <span className="font-semibold text-foreground">{confirmPhrase}</span> عشان تأكّد</>
            ) : (
              <>Type <span className="font-semibold text-foreground">{confirmPhrase}</span> to confirm</>
            )}
          </label>
          <input
            id={inputId.current}
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-10 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 text-sm text-foreground outline-none transition-colors focus:border-estate-gold/50 focus:ring-1 focus:ring-estate-gold/20"
          />
        </div>
      )}
    </Modal>
  )
}

/* ─── Form field ────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-gray-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-600">{hint}</p>}
    </div>
  )
}

export const fieldInputCls =
  'h-10 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-estate-gold/50 focus:ring-1 focus:ring-estate-gold/20 disabled:opacity-50'

export const fieldAreaCls = cn(
  fieldInputCls,
  'h-auto min-h-[84px] resize-y py-2 leading-relaxed'
)

export function fieldSelectCls(disabled = false) {
  return cn(fieldInputCls, 'appearance-none pr-8', disabled && 'pointer-events-none')
}

/* ─── Action button used inside the expanded cards ──────── */

export type ActionTone = 'default' | 'gold' | 'danger' | 'success'

const TONE_CLS: Record<ActionTone, string> = {
  default: 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground',
  gold: 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold hover:bg-estate-gold/20',
  danger: 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
  success: 'border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20',
}

export function ActionBtn({
  icon,
  label,
  onClick,
  tone = 'default',
  busy = false,
  disabled = false,
  title,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  tone?: ActionTone
  busy?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
        TONE_CLS[tone]
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  )
}

/* ─── Searchable multi-select list ──────────────────────── */

export function MultiPicker({
  items,
  selected,
  onToggle,
  searchPlaceholder,
  emptyLabel,
  maxHeight = 'max-h-56',
  disabled = false,
}: {
  items: { id: string; label: string; sub?: string }[]
  selected: string[]
  onToggle: (id: string) => void
  searchPlaceholder?: string
  emptyLabel?: string
  maxHeight?: string
  disabled?: boolean
}) {
  const { lang: pickerLang } = useLanguage()
  const pickerAr = pickerLang === 'ar'
  const searchPh = searchPlaceholder ?? (pickerAr ? 'دوّر…' : 'Search…')
  const emptyTx = emptyLabel ?? (pickerAr ? 'مفيش حاجة مطابقة.' : 'Nothing matches.')
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const visible = query
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(query) ||
          (i.sub || '').toLowerCase().includes(query)
      )
    : items

  return (
    <div
      className={cn(
        'rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03]',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPh}
        className="h-8 w-full border-b border-border dark:border-[#262626] bg-transparent px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none"
      />
      <div className={cn('space-y-1 overflow-y-auto p-2', maxHeight)}>
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-gray-600">{emptyTx}</p>
        ) : (
          visible.map((item) => {
            const on = selected.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
                  on
                    ? 'bg-estate-gold/10 text-estate-gold'
                    : 'text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                    on ? 'border-estate-gold bg-estate-gold' : 'border-border dark:border-[#262626]'
                  )}
                >
                  {on && <CheckCircle2 className="h-2.5 w-2.5 text-[#0F1A2C]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{item.label}</span>
                  {item.sub && (
                    <span className="block truncate text-[10px] text-gray-600">{item.sub}</span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ─── Status pill ───────────────────────────────────────── */

export function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: 'green' | 'yellow' | 'red' | 'gray' | 'blue'
  icon?: ReactNode
  children: ReactNode
}) {
  const tones = {
    green: 'border-green-500/20 bg-green-500/10 text-green-400',
    yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
    red: 'border-red-500/20 bg-red-500/10 text-red-400',
    gray: 'border-gray-500/20 bg-gray-500/10 text-gray-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tones[tone]
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function InlineNote({ tone = 'info', children }: { tone?: 'info' | 'err'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs',
        tone === 'err'
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export function ModalSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  )
}
