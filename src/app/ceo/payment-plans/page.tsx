'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { RefreshCw, Loader2, AlertCircle, Inbox, Plus, X, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Reveal } from '@/components/design'

type Milestone = { id: string; name: string; percentage: number; orderIndex: number }
type PaymentPlan = {
  id: string; name: string; description: string | null; downPaymentPercent: number;
  installmentYears: number; isActive: boolean; createdAt: string;
  project: { id: string; name: string } | null; milestones: Milestone[];
}
type Project = { id: string; name: string }
type PlanForm = { projectId: string; name: string; description: string; downPaymentPercent: string; installmentYears: string }
type MilestoneForm = { name: string; percentage: string }

const emptyPlanForm: PlanForm = { projectId: '', name: '', description: '', downPaymentPercent: '', installmentYears: '' }

export default function CEOPaymentPlansPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [plans, setPlans] = useState<PaymentPlan[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<PlanForm>(emptyPlanForm)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<PlanForm>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [milestoneEditId, setMilestoneEditId] = useState<string | null>(null)
  const [milestoneForm, setMilestoneForm] = useState<MilestoneForm>({ name: '', percentage: '' })

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const res = await fetch('/api/ceo/payment-plans')
      if (!res.ok) throw new Error('Failed to fetch payment plans')
      const data = await res.json(); setPlans(data.plans || [])
    } catch (err) {
      console.error('Failed to fetch payment plans:', err)
      setError(ar ? 'معرفناش نجيب خطط الدفع — حاول تاني.' : 'Failed to fetch payment plans')
    }
    finally { setLoading(false) }
  }, [ar])

  const fetchProjects = useCallback(async () => {
    try { const res = await fetch('/api/ceo/projects'); if (res.ok) { const data = await res.json(); setProjects(data.projects || []) } } catch { /* */ }
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])
  useEffect(() => { fetchProjects() }, [fetchProjects])

  const createPlan = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/ceo/payment-plans', {
        method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, downPaymentPercent: Number(formData.downPaymentPercent), installmentYears: Number(formData.installmentYears) }),
      })
      if (!res.ok) throw new Error('Failed to create')
      setShowCreateForm(false); setFormData(emptyPlanForm); await fetchPlans()
    } catch (err) {
      console.error('Failed to create plan:', err)
      alert(ar ? 'معرفناش نعمل الخطة — حاول تاني.' : 'Failed to create plan')
    } finally { setSubmitting(false) }
  }

  const updatePlan = async (id: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/ceo/payment-plans', {
        method: 'PATCH', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm, downPaymentPercent: editForm.downPaymentPercent ? Number(editForm.downPaymentPercent) : undefined, installmentYears: editForm.installmentYears ? Number(editForm.installmentYears) : undefined }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditingId(null); setEditForm({}); await fetchPlans()
    } catch (err) {
      console.error('Failed to update plan:', err)
      alert(ar ? 'معرفناش نحدّث الخطة — حاول تاني.' : 'Failed to update plan')
    } finally { setSubmitting(false) }
  }

  const toggleActive = async (id: string) => {
    const plan = plans.find((p) => p.id === id)
    try {
      const res = await fetch('/api/ceo/payment-plans', { method: 'PATCH', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isActive: !plan?.isActive }) })
      if (!res.ok) throw new Error('Failed to toggle'); await fetchPlans()
    } catch (err) {
      console.error('Failed to toggle plan:', err)
      alert(ar ? 'معرفناش نغيّر الحالة — حاول تاني.' : 'Failed to toggle plan')
    }
  }

  const addMilestone = async (planId: string) => {
    setSubmitting(true)
    try {
      const plan = plans.find((p) => p.id === planId)
      const res = await fetch('/api/ceo/payment-plans', {
        method: 'PATCH', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: planId, addMilestone: { name: milestoneForm.name, percentage: Number(milestoneForm.percentage), orderIndex: plan ? plan.milestones.length : 0 } }),
      })
      if (!res.ok) throw new Error('Failed to add milestone')
      setMilestoneEditId(null); setMilestoneForm({ name: '', percentage: '' }); await fetchPlans()
    } catch (err) {
      console.error('Failed to add milestone:', err)
      alert(ar ? 'معرفناش نضيف المرحلة — حاول تاني.' : 'Failed to add milestone')
    } finally { setSubmitting(false) }
  }

  const deleteMilestone = async (planId: string, milestoneId: string) => {
    try {
      const res = await fetch('/api/ceo/payment-plans', { method: 'PATCH', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: planId, removeMilestoneId: milestoneId }) })
      if (!res.ok) throw new Error('Failed to delete milestone'); await fetchPlans()
    } catch (err) {
      console.error('Failed to delete milestone:', err)
      alert(ar ? 'معرفناش نمسح المرحلة — حاول تاني.' : 'Failed to delete milestone')
    }
  }

  const deletePlan = async (id: string) => {
    try { const res = await fetch(`/api/ceo/payment-plans?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } }); if (!res.ok) throw new Error('Failed to delete'); await fetchPlans() }
    catch (err) {
      console.error('Failed to delete plan:', err)
      alert(ar ? 'معرفناش نمسح الخطة — حاول تاني.' : 'Failed to delete plan')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · خطط الدفع' : 'CEO Console · Payments'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'خطط الدفع' : 'Payment Plans'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'اعمل واتحكم في خطط الدفع بالمراحل بتاعتها' : 'Create and manage payment plans with milestones'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <Button onClick={fetchPlans} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />{ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)} className="bg-estate-gold text-black hover:bg-estate-gold/90">
            <Plus className="mr-2 h-4 w-4" />{ar ? 'خطة جديدة' : 'New Plan'}
          </Button>
        </div>
      </div>

      {showCreateForm && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{ar ? 'اعمل خطة دفع' : 'Create Payment Plan'}</h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreateForm(false); setFormData(emptyPlanForm) }} className="text-gray-400 hover:text-foreground"><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'المشروع' : 'Project'}</label>
                <select value={formData.projectId} onChange={(e) => setFormData({ ...formData, projectId: e.target.value })} className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none">
                  <option value="" className="bg-[#0a1220]">{ar ? 'اختار المشروع' : 'Select project'}</option>
                  {projects.map((p) => (<option key={p.id} value={p.id} className="bg-[#0a1220]">{p.name}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'اسم الخطة' : 'Plan Name'}</label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={ar ? 'مثال: الخطة العادية' : 'e.g. Standard Plan'} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'الوصف' : 'Description'}</label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={ar ? 'وصف اختياري' : 'Optional description'} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'المقدم %' : 'Down Payment %'}</label>
                <Input type="number" value={formData.downPaymentPercent} onChange={(e) => setFormData({ ...formData, downPaymentPercent: e.target.value })} placeholder="e.g. 20" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'سنين التقسيط' : 'Installment Years'}</label>
                <Input type="number" value={formData.installmentYears} onChange={(e) => setFormData({ ...formData, installmentYears: e.target.value })} placeholder="e.g. 5" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowCreateForm(false); setFormData(emptyPlanForm) }} className="border-border dark:border-[#262626] text-gray-400 hover:text-foreground">{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={createPlan} disabled={submitting || !formData.name} className="gold-shimmer bg-estate-gold text-black hover:bg-estate-gold/90">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{ar ? 'اعمل الخطة' : 'Create Plan'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" /><span>{error}</span>
          <Button onClick={fetchPlans} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-estate-gold" /></div>
      )}

      {!loading && !error && plans.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش خطط دفع' : 'No payment plans found'}</p>
          <p className="mt-1 text-sm text-gray-500">{ar ? 'اعمل أول خطة دفع عشان تبدأ' : 'Create your first payment plan to get started'}</p>
        </div>
      )}

      {!loading && !error && plans.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isExpanded = expandedId === plan.id
            return (
              <Card key={plan.id} className={cn('border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm transition-all', isExpanded && 'border-estate-gold/30 bg-estate-gold/5')}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{plan.name}</h3>
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', plan.isActive ? 'border-green-500/30 bg-green-500/15 text-green-400' : 'border-gray-500/30 bg-gray-500/15 text-gray-400')}>
                          {plan.isActive ? (ar ? 'شغالة' : 'Active') : (ar ? 'واقفة' : 'Inactive')}
                        </span>
                      </div>
                      {plan.description && <p className="mt-1 text-sm text-gray-400">{plan.description}</p>}
                      <p className="mt-2 text-xs text-gray-500">{plan.project?.name || (ar ? 'كل المشاريع' : 'All Projects')}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(plan.id)} className={plan.isActive ? 'text-green-400 hover:text-green-300' : 'text-gray-400 hover:text-foreground'}>
                        {plan.isActive ? (ar ? 'شغالة' : 'Active') : (ar ? 'واقفة' : 'Inactive')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : plan.id)} className="text-gray-400 hover:text-foreground">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
                      <p className="text-xs text-gray-400">{ar ? 'المقدم' : 'Down Payment'}</p>
                      <p className="text-lg font-bold text-estate-gold">{plan.downPaymentPercent}%</p>
                    </div>
                    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
                      <p className="text-xs text-gray-400">{ar ? 'المدة' : 'Duration'}</p>
                      <p className="text-lg font-bold text-foreground">{plan.installmentYears} {ar ? 'سنة' : 'years'}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">{ar ? `المراحل (${plan.milestones.length})` : `Milestones (${plan.milestones.length})`}</h4>
                        <Button size="sm" onClick={() => setMilestoneEditId(milestoneEditId === plan.id ? null : plan.id)} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
                          <Plus className="mr-1 h-3 w-3" />{ar ? 'ضيف' : 'Add'}
                        </Button>
                      </div>
                      {milestoneEditId === plan.id && (
                        <div className="flex gap-2">
                          <Input value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} placeholder={ar ? 'اسم المرحلة' : 'Milestone name'} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50" />
                          <Input type="number" value={milestoneForm.percentage} onChange={(e) => setMilestoneForm({ ...milestoneForm, percentage: e.target.value })} placeholder="%" className="w-24 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50" />
                          <Button size="sm" onClick={() => addMilestone(plan.id)} disabled={submitting || !milestoneForm.name} className="bg-estate-gold text-black hover:bg-estate-gold/90">{ar ? 'ضيف' : 'Add'}</Button>
                        </div>
                      )}
                      {plan.milestones.length === 0 ? (
                        <p className="py-3 text-center text-sm text-gray-500">{ar ? 'لسه مفيش مراحل' : 'No milestones yet'}</p>
                      ) : (
                        <div className="space-y-2">
                          {plan.milestones.sort((a, b) => a.orderIndex - b.orderIndex).map((m) => (
                            <div key={m.id} className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2">
                              <div className="flex items-center gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-estate-gold/10 text-xs font-bold text-estate-gold">{m.orderIndex + 1}</span>
                                <span className="text-sm text-foreground">{m.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-estate-gold">{m.percentage}%</span>
                                <Button size="sm" variant="ghost" onClick={() => deleteMilestone(plan.id, m.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {editingId === plan.id ? (
                        <div className="mt-3 space-y-3 rounded-2xl border border-estate-gold/20 bg-estate-gold/5 p-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'اسم الخطة' : 'Plan Name'}</label>
                              <Input value={editForm.name || plan.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'الوصف' : 'Description'}</label>
                              <Input value={editForm.description || plan.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'المقدم %' : 'Down Payment %'}</label>
                              <Input type="number" value={editForm.downPaymentPercent || plan.downPaymentPercent} onChange={(e) => setEditForm({ ...editForm, downPaymentPercent: e.target.value })} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'سنين التقسيط' : 'Installment Years'}</label>
                              <Input type="number" value={editForm.installmentYears || plan.installmentYears} onChange={(e) => setEditForm({ ...editForm, installmentYears: e.target.value })} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50" />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditForm({}) }} className="border-border dark:border-[#262626] text-gray-400 hover:text-foreground">{ar ? 'إلغاء' : 'Cancel'}</Button>
                            <Button size="sm" onClick={() => updatePlan(plan.id)} disabled={submitting} className="bg-estate-gold text-black hover:bg-estate-gold/90">
                              {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}{ar ? 'احفظ' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(plan.id); setEditForm({ name: plan.name, description: plan.description || '', downPaymentPercent: String(plan.downPaymentPercent), installmentYears: String(plan.installmentYears) }) }} className="text-gray-400 hover:text-foreground"><Edit2 className="mr-1 h-3.5 w-3.5" />{ar ? 'تعديل' : 'Edit'}</Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm(ar ? 'امسح الخطة دي؟' : 'Delete this plan?')) deletePlan(plan.id) }} className="text-gray-400 hover:text-red-400"><Trash2 className="mr-1 h-3.5 w-3.5" />{ar ? 'احذف' : 'Delete'}</Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
