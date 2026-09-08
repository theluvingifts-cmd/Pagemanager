import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Copy, Loader2, Play, Plus, Server, Trash2, X, XCircle } from 'lucide-react';
import { useMessenger } from '../MessengerContext';
import { WEEK_DAYS } from '../constants';
import type { AutomationPreviewResult, AutomationTab, QuickTemplate } from '../types';
import { replyFormulaLabel } from '../utils';

export const AutomationModal: React.FC<{ open: boolean; tab: AutomationTab; onTabChange: (tab: AutomationTab) => void; onClose: () => void }> = ({ open, tab, onTabChange, onClose }) => {
  const {
    automationConfig, setAutomationConfig, templates, automationLoading, automationSaving, automationRunning, automationNotice,
    detail, currentFormula, selectedId, setTemplates, saveAutomation, runAutomation, previewConversationAutomation,
    updateTemplate, addTemplate, removeTemplate, toggleWorkingDay,
    backgroundAutomationStatus, backgroundAutomationLoading, backgroundAutomationSaving,
    loadBackgroundAutomationStatus, setBackgroundAutomationEnabled, runBackgroundAutomationNow,
  } = useMessenger();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<AutomationPreviewResult | null>(null);
  const [testReport, setTestReport] = useState<any | null>(null);
  const [workerTestLoading, setWorkerTestLoading] = useState(false);

  useEffect(() => {
    if (!open) { setPreviewResult(null); return; }
    loadBackgroundAutomationStatus();
  }, [open, loadBackgroundAutomationStatus]);

  if (!open) return null;

  const preview = async () => {
    setPreviewLoading(true);
    setPreviewResult(await previewConversationAutomation());
    setPreviewLoading(false);
  };

  const runQuickTest = async () => {
    setTestReport({ loading: true, title: 'Đang chạy test nhanh...' });
    const data = await runAutomation(false, true);
    if (!data) {
      setTestReport({ error: true, title: 'Test thất bại', message: 'Không nhận được kết quả từ automation.' });
      return;
    }
    setTestReport({
      title: 'Kết quả test nhanh',
      dryRun: Boolean(data.dryRun),
      workingNow: Boolean(data.workingNow),
      currentLocalTime: data.currentLocalTime || '',
      currentWeekday: Number.isFinite(Number(data.currentWeekday)) ? Number(data.currentWeekday) : null,
      dayEnabled: data.dayEnabled !== false,
      previewConfigUsed: Boolean(data.previewConfigUsed),
      timezone: data.timezone || automationConfig.timezone || 'Asia/Ho_Chi_Minh',
      workingWindow: data.workingWindow || `${automationConfig.workingHours.start}–${automationConfig.workingHours.end}`,
      sent: Number(data.sent || 0),
      previewed: Number(data.previewed || 0),
      detected: Number(data.detected || 0),
      reminders: Number(data.reminders || 0),
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 5) : [],
      skipped: Boolean(data.skipped),
      reason: data.reason || '',
    });
  };

  const runWorkerTest = async () => {
    setWorkerTestLoading(true);
    setTestReport({ loading: true, title: 'Đang test worker nền...' });
    const data = await runBackgroundAutomationNow(true);
    setWorkerTestLoading(false);
    if (!data) {
      setTestReport({ error: true, title: 'Worker test thất bại', message: 'Không nhận được kết quả từ worker nền.' });
      return;
    }
    setTestReport({
      title: 'Kết quả worker nền',
      dryRun: true,
      workingNow: Boolean(data.workingNow),
      currentLocalTime: data.currentLocalTime || '',
      currentWeekday: Number.isFinite(Number(data.currentWeekday)) ? Number(data.currentWeekday) : null,
      dayEnabled: data.dayEnabled !== false,
      previewConfigUsed: Boolean(data.previewConfigUsed),
      timezone: data.timezone || automationConfig.timezone || 'Asia/Ho_Chi_Minh',
      workingWindow: data.workingWindow || `${automationConfig.workingHours.start}–${automationConfig.workingHours.end}`,
      sent: Number(data.sent || 0),
      previewed: Number(data.previewed || 0),
      detected: Number(data.detected || 0),
      reminders: Number(data.reminders || 0),
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 5) : [],
      skipped: Boolean(data.skipped),
      reason: data.reason || '',
    });
  };

  const saveAndClose = async () => {
    const ok = await saveAutomation();
    if (ok) onClose();
  };

  const missingBackground = backgroundAutomationStatus ? [
    !backgroundAutomationStatus.webhookSubscribed ? 'Page webhook' : null,
    !backgroundAutomationStatus.webhookVerifyConfigured ? 'Verify token' : null,
    !backgroundAutomationStatus.schedulerConfigured ? 'Scheduler secret' : null,
    !backgroundAutomationStatus.lastRunAt ? 'Cron chưa chạy lần nào' : null,
  ].filter(Boolean) as string[] : [];

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-5" onClick={onClose}>
      <div className="w-full max-w-[980px] h-[min(760px,90vh)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col" onClick={event => event.stopPropagation()}>
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div><h3 className="text-sm font-extrabold text-slate-900">Tự động hóa Messenger</h3><p className="text-[9px] text-slate-500">Rule chung · tin mẫu · test công thức từng chat</p></div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-1">
            {([['rules', 'Rule & giờ'], ['templates', 'Tin nhắn mẫu'], ['test', 'Test & kiểm tra']] as Array<[AutomationTab, string]>).map(([key, label]) => <button key={key} type="button" onClick={() => onTabChange(key)} className={`h-8 px-3 rounded-lg text-[10px] font-bold ${tab === key ? 'bg-white border border-slate-200 text-violet-700 shadow-sm' : 'text-slate-500 hover:bg-white'}`}>{label}</button>)}
          </div>
          <div className="flex items-center gap-2 text-[9px]"><span className="text-slate-500">Bật tự động hóa</span><button type="button" onClick={() => setAutomationConfig(prev => ({ ...prev, enabled: !prev.enabled }))} className={`relative w-10 h-5 rounded-full ${automationConfig.enabled ? 'bg-violet-600' : 'bg-slate-200'}`}><span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${automationConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
        </div>

        {(automationNotice || testReport) && (
          <div className="px-4 pt-2 shrink-0 space-y-2">
            {automationNotice && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-center gap-2 text-[9px] font-semibold text-blue-800">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{automationNotice}</span>
              </div>
            )}
            {testReport && <TestReport report={testReport} onClose={() => setTestReport(null)} />}
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto p-4">
          {automationLoading ? <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-600" /></div> : null}

          {!automationLoading && tab === 'rules' && <div className="space-y-3">
            <section className={`rounded-xl border p-3 ${backgroundAutomationStatus?.enabled ? 'border-emerald-200 bg-emerald-50/35' : 'border-slate-200 bg-slate-50/50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${backgroundAutomationStatus?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-500'}`}><Server className="w-4 h-4" /></div>
                  <div className="min-w-0"><div className="flex items-center gap-1.5"><h4 className="text-[11px] font-extrabold text-slate-900">Chạy nền 24/7</h4>{backgroundAutomationStatus?.ready ? <span className="text-[7px] font-extrabold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">SẴN SÀNG</span> : null}</div><p className="text-[8px] text-slate-500 mt-0.5">Webhook nhận tin realtime · worker xử lý rule kể cả khi đóng Page Manager.</p></div>
                </div>
                <button type="button" disabled={backgroundAutomationLoading || backgroundAutomationSaving} onClick={() => setBackgroundAutomationEnabled(!backgroundAutomationStatus?.enabled)} className={`relative w-10 h-5 rounded-full shrink-0 disabled:opacity-40 ${backgroundAutomationStatus?.enabled ? 'bg-emerald-600' : 'bg-slate-200'}`}><span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${backgroundAutomationStatus?.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
              </div>
              {backgroundAutomationLoading ? <div className="mt-2 text-[8px] text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/>Đang kiểm tra hệ thống chạy nền...</div> : backgroundAutomationStatus ? <>
                <div className="mt-2 grid md:grid-cols-4 gap-1.5">
                  <HealthPill ok={backgroundAutomationStatus.webhookSubscribed} label="Page webhook" />
                  <HealthPill ok={backgroundAutomationStatus.webhookVerifyConfigured} label="Verify token" />
                  <HealthPill ok={backgroundAutomationStatus.schedulerConfigured} label="Scheduler secret" />
                  <HealthPill ok={Boolean(backgroundAutomationStatus.lastRunAt)} label={backgroundAutomationStatus.lastRunAt ? `Cron ${formatTinyTime(backgroundAutomationStatus.lastRunAt)}` : 'Cron chưa chạy'} />
                </div>
                <div className={`mt-2 rounded-lg border px-2.5 py-2 flex items-start gap-2 text-[8px] ${backgroundAutomationStatus.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                  {backgroundAutomationStatus.ready ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5"/> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>}
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold">{backgroundAutomationStatus.ready ? 'Hệ thống 24/7 đã sẵn sàng' : `Chưa sẵn sàng${missingBackground.length ? ` · thiếu ${missingBackground.join(', ')}` : ''}`}</div>
                    <div className="mt-0.5 opacity-80">{backgroundAutomationStatus.lastError ? `Lỗi gần nhất: ${backgroundAutomationStatus.lastError}` : backgroundAutomationStatus.lastWebhookAt ? `Webhook gần nhất: ${formatTinyTime(backgroundAutomationStatus.lastWebhookAt)}` : 'Chưa có webhook nào được ghi nhận.'}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => copyText(backgroundAutomationStatus.callbackUrl)} title="Copy callback URL" className="w-7 h-7 rounded-md border border-current/20 bg-white/80 flex items-center justify-center"><Copy className="w-3 h-3"/></button>
                    <button type="button" disabled={workerTestLoading} onClick={runWorkerTest} className="h-7 px-2 rounded-md border border-current/20 bg-white/80 text-[8px] font-bold disabled:opacity-50">{workerTestLoading ? 'Đang test...' : 'Test worker'}</button>
                  </div>
                </div>
              </> : null}
              {backgroundAutomationStatus && (!backgroundAutomationStatus.schedulerConfigured || !backgroundAutomationStatus.webhookVerifyConfigured) ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 flex items-start gap-1.5 text-[8px] text-amber-800"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0"/><span>Cần cấu hình <b>AUTOMATION_CRON_SECRET</b> và <b>META_WEBHOOK_VERIFY_TOKEN</b> trong Environment trước khi bật 24/7 thật.</span></div> : null}
            </section>

            <section className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-slate-500" /><h4 className="text-[11px] font-extrabold text-slate-900">Giờ hoạt động</h4></div>
              <div className="mt-2 grid sm:grid-cols-[120px_120px_1fr] gap-2 items-end"><label className="text-[8px] font-bold text-slate-500">Từ<input type="time" value={automationConfig.workingHours.start} onChange={e => setAutomationConfig(prev => ({ ...prev, workingHours: { ...prev.workingHours, start: e.target.value } }))} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 text-[10px]" /></label><label className="text-[8px] font-bold text-slate-500">Đến<input type="time" value={automationConfig.workingHours.end} onChange={e => setAutomationConfig(prev => ({ ...prev, workingHours: { ...prev.workingHours, end: e.target.value } }))} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 text-[10px]" /></label><div className="flex items-center gap-1 flex-wrap">{WEEK_DAYS.map(day => <button type="button" key={day.value} onClick={() => toggleWorkingDay(day.value)} className={`w-8 h-8 rounded-lg text-[9px] font-bold border ${automationConfig.workingHours.days.includes(day.value) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}>{day.label}</button>)}</div></div>
            </section>

            <div className="grid md:grid-cols-3 gap-2.5">
              <RuleCard title="Khách nhắn nhưng chưa ai rep" enabled={automationConfig.noStaffReply.enabled} onEnabled={enabled => setAutomationConfig(prev => ({ ...prev, noStaffReply: { ...prev.noStaffReply, enabled } }))} delay={automationConfig.noStaffReply.delayHours} onDelay={delayHours => setAutomationConfig(prev => ({ ...prev, noStaffReply: { ...prev.noStaffReply, delayHours } }))} text={automationConfig.noStaffReply.template} onText={template => setAutomationConfig(prev => ({ ...prev, noStaffReply: { ...prev.noStaffReply, template } }))} />
              <RuleCard title="Shop đã nhắn, khách chưa trả lời" enabled={automationConfig.noCustomerReply.enabled} onEnabled={enabled => setAutomationConfig(prev => ({ ...prev, noCustomerReply: { ...prev.noCustomerReply, enabled } }))} delay={automationConfig.noCustomerReply.delayHours} onDelay={delayHours => setAutomationConfig(prev => ({ ...prev, noCustomerReply: { ...prev.noCustomerReply, delayHours } }))} text={automationConfig.noCustomerReply.template} onText={template => setAutomationConfig(prev => ({ ...prev, noCustomerReply: { ...prev.noCustomerReply, template } }))} />
              <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div><h4 className="text-[11px] font-extrabold text-amber-900">Mồi lại khách</h4><p className="text-[8px] text-amber-700">Chỉ tạo nhắc ngoài 24h.</p></div><input type="checkbox" checked={automationConfig.reengage.enabled} onChange={e => setAutomationConfig(prev => ({ ...prev, reengage: { ...prev.reengage, enabled: e.target.checked } }))} className="accent-amber-600" /></div><select value={automationConfig.reengage.afterDays} onChange={e => setAutomationConfig(prev => ({ ...prev, reengage: { ...prev.reengage, afterDays: Number(e.target.value) } }))} className="h-7 px-2 rounded-md border border-amber-200 bg-white text-[9px]"><option value={2}>2 ngày</option><option value={3}>3 ngày</option><option value={4}>4 ngày</option><option value={7}>7 ngày</option></select><textarea rows={3} value={automationConfig.reengage.template} onChange={e => setAutomationConfig(prev => ({ ...prev, reengage: { ...prev.reengage, template: e.target.value } }))} className="w-full resize-none rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[9px]" /></section>
            </div>

            <section className="rounded-xl border border-violet-200 bg-violet-50/35 px-3 py-2.5 flex items-center justify-between gap-4"><div><div className="flex items-center gap-1.5"><h4 className="text-[10px] font-extrabold text-slate-900">Tự nhận diện quan tâm / báo giá / chốt</h4></div><p className="text-[8px] text-slate-500 mt-0.5">Trạng thái chỉnh tay được khóa, automation không ghi đè.</p></div><div className="flex items-center gap-3 text-[8px] font-bold text-slate-600"><label className="flex items-center gap-1"><input type="checkbox" checked={automationConfig.autoDetect.enabled} onChange={e => setAutomationConfig(prev => ({ ...prev, autoDetect: { ...prev.autoDetect, enabled: e.target.checked } }))}/>Bật</label><label className="flex items-center gap-1"><input type="checkbox" checked={automationConfig.autoDetect.autoApplyOrdered} onChange={e => setAutomationConfig(prev => ({ ...prev, autoDetect: { ...prev.autoDetect, autoApplyOrdered: e.target.checked } }))}/>Auto chốt</label></div></section>
          </div>}

          {!automationLoading && tab === 'templates' && <div className="space-y-2"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-extrabold text-slate-900">Tin nhắn mẫu</h4><p className="text-[9px] text-slate-500">Hỗ trợ {'{{name}}'} / {'{{page}}'}.</p></div><button type="button" onClick={addTemplate} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-bold"><Plus className="w-3 h-3"/>Thêm mẫu</button></div><div className="grid md:grid-cols-2 gap-2">{templates.map(template => <TemplateEditor key={template.id} template={template} onUpdate={patch => updateTemplate(template.id, patch)} onRemove={() => removeTemplate(template.id)} />)}</div></div>}

          {!automationLoading && tab === 'test' && <div className="space-y-3">
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 flex items-center justify-between gap-4"><div><h4 className="text-[11px] font-extrabold text-amber-900">Test toàn hệ thống</h4><p className="text-[9px] text-amber-700 mt-0.5">Chỉ tính hành động, không gửi và không đổi trạng thái.</p></div><button type="button" onClick={() => setAutomationConfig(prev => ({ ...prev, testMode: !prev.testMode }))} className={`relative w-10 h-5 rounded-full ${automationConfig.testMode ? 'bg-amber-500' : 'bg-slate-200'}`}><span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${automationConfig.testMode ? 'translate-x-6' : 'translate-x-1'}`}/></button></section>
            <section className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div><h4 className="text-[11px] font-extrabold text-slate-900">Test cuộc chat đang mở</h4><p className="text-[9px] text-slate-500 mt-0.5">{detail?.customer?.name || 'Chưa chọn hội thoại'} · {detail ? replyFormulaLabel(currentFormula.mode) : '--'}</p></div><button type="button" onClick={preview} disabled={!selectedId || previewLoading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-[9px] font-bold disabled:opacity-40">{previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5"/>}Kiểm tra</button></div>
              {previewResult && <div className="mt-3 space-y-2">{previewResult.error ? <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-[9px] font-bold text-rose-700">{previewResult.error}</div> : <><div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">{(previewResult.summary || []).map((item, idx) => <div key={idx} className={`rounded-lg border p-2 ${item.ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><p className="text-[8px] text-slate-500">{item.label}</p><p className="mt-0.5 text-[9px] font-extrabold text-slate-800">{item.value}</p></div>)}</div><div className="space-y-1.5">{(previewResult.actions || []).map((action, idx) => <div key={idx} className={`rounded-lg border px-2.5 py-2 ${action.wouldAct ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-white'}`}><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-extrabold text-slate-800">{action.label}</span><span className={`text-[8px] font-bold ${action.wouldAct ? 'text-violet-700' : 'text-slate-400'}`}>{action.wouldAct ? 'SẼ ÁP DỤNG' : 'CHƯA ĐỦ ĐIỀU KIỆN'}</span></div><p className="mt-0.5 text-[8px] text-slate-500">{action.reason}</p>{action.message && <p className="mt-1.5 rounded bg-white/70 p-2 text-[9px] leading-relaxed text-slate-700">{action.message}</p>}</div>)}</div></>}</div>}
            </section>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[8px] leading-relaxed text-slate-500">Test riêng từng cuộc chat: bật “Chỉ test” trong Công thức trả lời ở panel khách.</div>
          </div>}
        </main>

        <div className="h-12 px-4 border-t border-slate-200 bg-white shrink-0 flex items-center justify-between gap-3">
          <button type="button" onClick={runQuickTest} disabled={!automationConfig.enabled || automationRunning} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[9px] font-bold disabled:opacity-40">{automationRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5"/>}{automationRunning ? 'Đang test...' : 'Chạy test nhanh'}</button>
          <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[9px] font-bold">Đóng</button><button type="button" onClick={saveAndClose} disabled={automationSaving} className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-bold disabled:opacity-50">{automationSaving ? 'Đang lưu...' : 'Lưu cài đặt'}</button></div>
        </div>
      </div>
    </div>
  );
};


const formatTinyTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const copyText = (value?: string | null) => {
  if (!value) return;
  navigator.clipboard?.writeText(value).catch(() => undefined);
};

const WEEKDAY_LABEL: Record<number, string> = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' };

const TestReport: React.FC<{ report: any; onClose: () => void }> = ({ report, onClose }) => {
  if (report.loading) return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2 text-[9px] text-slate-600"><Loader2 className="w-3.5 h-3.5 animate-spin"/><span className="font-bold">{report.title}</span></div>;
  if (report.error) return <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 flex items-start gap-2 text-[9px] text-rose-700"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/><div className="flex-1"><div className="font-extrabold">{report.title}</div><div className="mt-0.5">{report.message}</div></div><button onClick={onClose} className="text-rose-400 hover:text-rose-700"><X className="w-3 h-3"/></button></div>;
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] text-emerald-900">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 font-extrabold"><CheckCircle2 className="w-3.5 h-3.5"/>{report.title}</div><button onClick={onClose} className="text-emerald-500 hover:text-emerald-800"><X className="w-3 h-3"/></button></div>
    <div className="mt-1.5 grid grid-cols-2 md:grid-cols-5 gap-1.5">
      <MiniStat
        label={report.currentLocalTime ? `Giờ VN · ${report.currentLocalTime}` : 'Giờ hoạt động'}
        value={`${report.currentWeekday !== null && report.currentWeekday !== undefined ? `${WEEKDAY_LABEL[report.currentWeekday] || `Ngày ${report.currentWeekday}`} · ` : ''}${report.workingNow ? 'Đang trong giờ' : (report.dayEnabled === false ? 'Ngày này đang tắt' : 'Ngoài giờ')}${report.workingWindow ? ` · ${report.workingWindow}` : ''}`}
      />
      <MiniStat label="Sẽ gửi" value={String(report.previewed || 0)} />
      <MiniStat label="Nhận diện" value={String(report.detected || 0)} />
      <MiniStat label="Follow-up" value={String(report.reminders || 0)} />
      <MiniStat label="Chế độ" value={report.dryRun ? 'TEST · không gửi' : 'LIVE'} />
    </div>
    {report.skipped && <div className="mt-1.5 text-amber-700 font-bold">Bỏ qua: {report.reason || 'không đủ điều kiện chạy'}</div>}
    {Array.isArray(report.actions) && report.actions.length > 0 && <div className="mt-1.5 space-y-1">{report.actions.map((action: any, idx: number) => <div key={idx} className="rounded-md border border-emerald-200/70 bg-white/70 px-2 py-1"><span className="font-bold">{action.customerName || 'Khách'}:</span> {action.detail || action.type}</div>)}</div>}
    {report.previewConfigUsed && <div className="mt-1.5 text-emerald-800 font-semibold">Test đang dùng đúng cấu hình hiện tại trên popup — không cần bấm Lưu trước.</div>}
    {!report.skipped && (!report.actions || report.actions.length === 0) && <div className="mt-1 text-emerald-700">Đã kiểm tra xong, hiện chưa có hội thoại nào đủ điều kiện để automation hành động.</div>}
  </div>;
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="rounded-md border border-emerald-200/70 bg-white/70 px-2 py-1"><div className="text-[7px] text-slate-500">{label}</div><div className="font-extrabold text-[8px] text-slate-800">{value}</div></div>;

const HealthPill: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <div className={`h-7 rounded-lg border px-2 flex items-center gap-1.5 text-[8px] font-bold ${ok ? 'border-emerald-200 bg-white text-emerald-700' : 'border-rose-200 bg-white text-rose-600'}`}>
    {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
    <span className="truncate">{ok ? 'OK · ' : 'THIẾU · '}{label}</span>
  </div>
);

const RuleCard: React.FC<{ title: string; enabled: boolean; onEnabled: (v: boolean) => void; delay: number; onDelay: (v: number) => void; text: string; onText: (v: string) => void }> = ({ title, enabled, onEnabled, delay, onDelay, text, onText }) => (
  <section className="rounded-xl border border-slate-200 p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div><h4 className="text-[11px] font-extrabold text-slate-900">{title}</h4><p className="text-[8px] text-slate-500">Chỉ chạy trong giờ hoạt động và cửa sổ Messenger hợp lệ.</p></div><input type="checkbox" checked={enabled} onChange={e => onEnabled(e.target.checked)} className="accent-violet-600" /></div><div className="flex items-center gap-1.5 text-[9px]"><span>Chờ</span><input type="number" min={1} max={12} value={delay} onChange={e => onDelay(Number(e.target.value) || 1)} className="w-14 h-7 px-2 rounded-md border border-slate-200" /><span>giờ</span></div><textarea rows={3} value={text} onChange={e => onText(e.target.value)} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px]" /></section>
);

const TemplateEditor: React.FC<{ template: QuickTemplate; onUpdate: (patch: Partial<QuickTemplate>) => void; onRemove: () => void }> = ({ template, onUpdate, onRemove }) => (
  <div className="rounded-lg border border-slate-200 p-2.5 space-y-1.5"><div className="flex gap-1.5"><input value={template.title} onChange={e => onUpdate({ title: e.target.value })} className="flex-1 h-7 px-2 rounded-md border border-slate-200 text-[9px] font-bold"/><select value={template.category || 'general'} onChange={e => onUpdate({ category: e.target.value as QuickTemplate['category'] })} className="h-7 px-1.5 rounded-md border border-slate-200 text-[8px]"><option value="general">Chung</option><option value="price">Báo giá</option><option value="followup">Follow-up</option><option value="order">Chốt đơn</option><option value="support">Hỗ trợ</option></select><button type="button" onClick={onRemove} className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="w-3 h-3"/></button></div><textarea rows={3} value={template.text} onChange={e => onUpdate({ text: e.target.value })} className="w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px]"/></div>
);
