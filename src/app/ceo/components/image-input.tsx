'use client'

import { useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Image as ImageIcon, Upload, Loader2, X } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'

// Uploads one file to /api/ceo/upload and returns the public URL.
export async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/ceo/upload', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data.url
}

interface ImageInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

/**
 * Single-image field for CEO forms: preview + URL input + one-click upload.
 * Works on dark CEO pages (white/5 surfaces, gold accents).
 */
export default function ImageInput({ label, value, onChange, disabled }: ImageInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewBroken, setPreviewBroken] = useState(false)

  const handleFile = async (file?: File | null) => {
    if (!file) return
    setError(null)
    setPreviewBroken(false)
    setUploading(true)
    try {
      onChange(await uploadImageFile(file))
    } catch (e) {
      console.error('Image upload failed:', e)
      setError(ar ? 'الرفع فشل — حاول تاني.' : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mb-1.5 space-y-1.5">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
          {value && !previewBroken ? (
            <Image
              src={value}
              alt={label}
              width={112}
              height={80}
              className="h-full w-full object-cover"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setPreviewBroken(false)
              onChange(e.target.value)
            }}
            disabled={disabled || uploading}
            placeholder="https://example.com/image.jpg"
            className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:outline-none focus:ring-1 focus:ring-estate-gold/20 disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
              className="inline-flex items-center gap-1.5 rounded-full border border-estate-gold/40 bg-estate-gold/10 px-3 py-1.5 text-xs font-medium text-estate-gold transition-colors hover:bg-estate-gold/20 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? (ar ? 'بيترفع…' : 'Uploading…') : (ar ? 'ارفع صورة' : 'Upload image')}
            </button>
            {value && !disabled && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setPreviewBroken(false)
                }}
                className="inline-flex items-center gap-1 rounded-full border border-border dark:border-[#262626] px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:border-red-400/40 hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" /> {ar ? 'اشيلها' : 'Remove'}
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

interface UploadButtonProps {
  onUploaded: (url: string) => void
  disabled?: boolean
  children?: ReactNode
}

// Small standalone upload button (used to append images to galleries).
export function UploadButton({ onUploaded, disabled, children }: UploadButtonProps) {
  const ref = useRef<HTMLInputElement>(null)
  const { lang: upLang } = useLanguage()
  const upAr = upLang === 'ar'
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file?: File | null) => {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      onUploaded(await uploadImageFile(file))
    } catch (e) {
      console.error('Image upload failed:', e)
      setError(upAr ? 'الرفع فشل — حاول تاني.' : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled || uploading}
        className="inline-flex items-center gap-1.5 rounded-full border border-estate-gold/40 bg-estate-gold/10 px-3 py-1.5 text-xs font-medium text-estate-gold transition-colors hover:bg-estate-gold/20 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? (upAr ? 'بيترفع…' : 'Uploading…') : children || (upAr ? 'ارفع' : 'Upload')}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </span>
  )
}
