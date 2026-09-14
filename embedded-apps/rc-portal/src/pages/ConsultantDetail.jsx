import { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, FileText, Calendar, Users, CreditCard, Briefcase, 
  Building2, Phone, FileSignature, Download, CheckCircle2, ShieldCheck, Tag, Copy, AlertTriangle,
  Edit3, Plus, Trash2, Save, X, Check
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import SuccessModal from '../components/SuccessModal';
import ConfirmModal from '../components/ConfirmModal';
import PageHeader from '../components/PageHeader';
import { getAgreementPdf, getConsultant, getConsultantDetail, getInvoicePdf, updateConsultant, updateConsultantStatus, getFeeSlabs, updateFeeSlabs } from '../services/odataService';
import { formatCurrency, formatDate, paymentStatusColor, paymentStatusText, statusColor, statusText } from '../utils/formatters';

const getAvatarColor = (name) => {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 
    'bg-emerald-500', 'bg-rc-indigo-500', 'bg-cyan-500', 'bg-sky-500', 
    'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 
    'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function ConsultantDetail() {
  const navigate = useNavigate();
  const { consultantId: rawId } = useParams();
  const consultantId = decodeURIComponent(rawId);
  const { setBusy } = useContext(AppContext);

  const [consultant, setConsultant] = useState(null);
  const [detail, setDetail] = useState(null);
  const [slabs, setSlabs] = useState([]);
  
  const [activeTab, setActiveTab] = useState('contract');
  const [vendorCode, setVendorCode] = useState('');
  const [vendorSaving, setVendorSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [successModalData, setSuccessModalData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);

  const [copiedField, setCopiedField] = useState('');
  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const userRole = (localStorage.getItem('employeeRole') || '').trim();
  const isSuperadmin = userRole === 'S' || userRole === 'Superadmin';

  // CTC Slab Editing State (Superadmin)
  const [isEditingSlabs, setIsEditingSlabs] = useState(false);
  const [tempSlabs, setTempSlabs] = useState([]);
  const [isSavingSlabs, setIsSavingSlabs] = useState(false);
  const [slabModalError, setSlabModalError] = useState('');

  const handleOpenSlabEdit = () => {
    setTempSlabs(JSON.parse(JSON.stringify(slabs.length > 0 ? slabs : [{ FromAmount: '0', ToAmount: '', FeePercent: '' }])));
    setSlabModalError('');
    setIsEditingSlabs(true);
  };

  const handleAddSlabRow = () => {
    const lastSlab = tempSlabs[tempSlabs.length - 1];
    const lastTo = Number(lastSlab?.ToAmount || 0);
    const nextFrom = lastTo > 0 && lastTo < 99999999 ? lastTo + 1 : '';
    setTempSlabs([...tempSlabs, { FromAmount: String(nextFrom), ToAmount: '', FeePercent: '' }]);
  };

  const handleRemoveSlabRow = (index) => {
    if (tempSlabs.length <= 1) return;
    setTempSlabs(tempSlabs.filter((_, idx) => idx !== index));
  };

  const handleSaveSlabs = async () => {
    const preparedSlabs = tempSlabs.map(s => {
      const pct = s.FeePercent || s.FeePersent || s.feePercent || '';
      return {
        FeeId: s.FeeId || '',
        ConsultantId: consultantId,
        FromAmount: s.FromAmount,
        ToAmount: s.ToAmount || '99999999',
        FeePersent: pct,
        FeePercent: pct
      };
    });

    const validSlabs = preparedSlabs.filter(s => s.FromAmount !== '' || s.FeePersent !== '');
    if (validSlabs.length === 0) {
      setSlabModalError('Please configure at least one valid slab row.');
      return;
    }
    for (const s of validSlabs) {
      if (s.FromAmount === '' || s.FeePersent === '') {
        setSlabModalError('Please specify From CTC Amount and Fee Percentage for all active slab rows.');
        return;
      }
    }

    setSlabModalError('');
    setIsSavingSlabs(true);
    try {
      await updateFeeSlabs(consultantId, validSlabs);
      const updatedSlabs = await getFeeSlabs(consultantId);
      setSlabs(updatedSlabs.length > 0 ? updatedSlabs : validSlabs);
      setIsEditingSlabs(false);
      setSuccessModalData({
        title: 'CTC Slab Matrix Updated!',
        message: `Fee slabs for Consultant ${consultantId} have been successfully updated in SAP (FEESSET_UPDATE_ENTITY).`
      });
    } catch (err) {
      console.error('Error saving slabs:', err);
      setSlabModalError(err?.response?.data?.error || err.message || 'Failed to update slabs in SAP.');
    } finally {
      setIsSavingSlabs(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      setBusy(true);
      setError(null);
      try {
        const [consultantData, detailData, slabsData] = await Promise.all([
          getConsultant(consultantId),
          getConsultantDetail(consultantId),
          getFeeSlabs(consultantId)
        ]);
        
        setConsultant(consultantData);
        setDetail(detailData);
        setSlabs(slabsData);
        setVendorCode(consultantData.ActualVendor || detailData.ActualVendor || '');
      } catch (err) {
        console.error('[ConsultantDetail] Load error:', err);
        setError('Failed to load consultant details. Please try again.');
      } finally {
        setBusy(false);
      }
    }
    loadData();
  }, [consultantId, setBusy]);

  const closures = detail?.Nav_ConsIdToClos?.results || [];
  const rawPayments = detail?.NAV_ConsIdToInv?.results || [];
  const payments = rawPayments.filter((item, index, self) =>
    index === self.findIndex((t) => t.InvNumber === item.InvNumber)
  );

  const hasTa = consultant?.Ta === 'X' || closures.some((c) => c.Ta === 'X');
  const hasTm = consultant?.Tm === 'X' || closures.some((c) => c.Tm === 'X');
  const hasLd = consultant?.Ld === 'X' || closures.some((c) => c.Ld === 'X');
  const hasOd = consultant?.Od === 'X' || closures.some((c) => c.Od === 'X');

  async function handleStatusChange(event) {
    const newStatus = event.target.value;
    if (newStatus === 'INACTIVE') {
      setPendingStatus(newStatus);
      setShowConfirmModal(true);
      return;
    }
    await executeStatusChange(newStatus);
  }

  async function executeStatusChange(newStatus) {
    try {
      await updateConsultantStatus(consultantId, newStatus);
      setConsultant((prev) => ({ ...prev, Status: newStatus }));
      setSuccessModalData({
        title: "Status Updated",
        message: `The consultant's status has been successfully updated to ${newStatus === 'ACTIVE' ? 'Active' : 'Inactive'}.`
      });
    } catch (err) {
      setToastMessage("Failed to update status");
      setTimeout(() => setToastMessage(''), 3000);
    } finally {
      setShowConfirmModal(false);
      setPendingStatus(null);
    }
  }

  // Only enabled when there is genuinely something new to save, so the tick can't re-send
  // a value SAP already holds.
  const vendorCodeDirty =
    Boolean(vendorCode.trim()) && vendorCode.trim() !== (consultant?.ActualVendor || '').trim();

  // Saved on click (or Enter) instead of on every keystroke. This used to fire from the input's
  // onChange, so typing "Vendor123459" sent twelve separate PUTs whose responses could land out
  // of order. It was also called without await or try/catch, so any failure was a silent
  // unhandled rejection and the user saw nothing either way.
  //
  // The payload stays partial — just { ActualVendor } — because CONSULTANTSET_UPDATE_ENTITY
  // guards every field with IF ls_req-<field> IS NOT INITIAL, so untouched fields keep their
  // stored values. Confirmed live: name, PAN, GST and engagement type all survived a save.
  async function saveVendorCode() {
    const value = vendorCode.trim();
    if (!value || vendorSaving || !consultant) return;

    setVendorSaving(true);
    try {
      await updateConsultant(consultantId, { ActualVendor: value });
      setConsultant((prev) => (prev ? { ...prev, ActualVendor: value } : prev));
      setVendorCode(value);
      setToastMessage('Vendor code saved');
    } catch (err) {
      console.error('Failed to save vendor code', err);
      setToastMessage('Failed to save vendor code');
    } finally {
      setVendorSaving(false);
      setTimeout(() => setToastMessage(''), 3000);
    }
  }

  async function downloadAgreement() {
    try {
      const data = await getAgreementPdf(consultantId);
      const binary = atob(data.Value || '');
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.Filename || 'agreement.pdf';
      link.click();
    } catch (err) {
      alert("Failed to download agreement file.");
    }
  }

  async function downloadInvoice(item) {
    try {
      const data = await getInvoicePdf(consultantId, item.InvNumber);
      const binary = atob(data.Value || '');
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.Filename || `${item.InvNumber}.pdf`;
      link.click();
    } catch (err) {
      alert(`Downloading invoice ${item.InvNumber}...`);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
        <div className="text-red-700 font-semibold text-base mb-3">{error}</div>
        <button className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition cursor-pointer" onClick={() => navigate(-1)}>
          Go Back
        </button>
      </div>
    );
  }

  if (!consultant || !detail) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-10 w-10 border-4 border-rc-teal/30 border-t-rc-teal rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-700">Loading consultant details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl bg-slate-900 px-5 py-3.5 text-xs font-bold text-white shadow-2xl transition-all border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          {toastMessage}
        </div>
      )}
      
      {/* Top Header Banner */}
      <PageHeader>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-600 hover:bg-rc-teal hover:text-white hover:border-rc-teal transition shadow-sm cursor-pointer group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:text-white transition-colors" />
            <span className="text-xs font-semibold uppercase tracking-wider">Back</span>
          </button>
          <div className="flex items-center gap-3.5">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${getAvatarColor(consultant.ConsuName)} text-base font-semibold text-white shadow-sm`}>
              {(consultant.ConsuName || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{consultant.ConsuName}</h1>
                <span className={`rc-status-pill text-xs font-semibold ${statusColor(consultant.Status)}`}>
                  {statusText(consultant.Status)}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                Consultant ID: <span className="font-mono text-rc-teal font-semibold">{consultant.ConsultantId}</span> • Type: <span className="font-semibold text-slate-700">{consultant.ConsuType}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {consultant.Status === 'ACTIVE' && (
            <button
              onClick={() => navigate(`/closure/${consultantId}`)}
              className="flex items-center gap-2 rounded-lg bg-rc-teal px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rc-teal-dark transition cursor-pointer"
            >
              <FileSignature className="h-4 w-4" /> Log Closure
            </button>
          )}

          <button
            onClick={downloadAgreement}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm cursor-pointer"
          >
            <Download className="h-4 w-4" /> Agreement
          </button>

          <select
            value={consultant.Status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
            onChange={handleStatusChange}
            disabled={!isSuperadmin}
            className="rc-input bg-white font-semibold text-slate-800 border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer text-xs shadow-sm"
          >
            <option value="INACTIVE">Status: INACTIVE</option>
            <option value="ACTIVE">Status: ACTIVE</option>
          </select>
        </div>
      </PageHeader>

      {/* KPI Summary Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {/* Tile 1: Contract Period */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contract Period</p>
              <h4 className="text-base font-semibold text-slate-900 mt-1">
                {consultant.ContStart ? `${formatDate(consultant.ContStart)} - ${formatDate(consultant.ContEnd)}` : '-'}
              </h4>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Tile 2: Total Hires */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Hires</p>
              <h4 className="text-2xl font-semibold text-slate-900 mt-1">
                {consultant.TotalHires || 0}
              </h4>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Tile 3: Total Fees Paid */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Fees Paid</p>
              <h4 className="text-xl font-semibold text-slate-900 mt-1">
                {formatCurrency(consultant.TotalFees || 0)}
              </h4>
            </div>
            <div className="p-2.5 rounded-lg bg-violet-50 text-violet-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Tile 4: Engagement Type */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Engagement Type</p>
              <h4 className="text-base font-semibold text-slate-900 mt-1">
                {consultant.EngageType || '-'}
              </h4>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 pb-5 border-b border-slate-200">
          {[
            { id: 'contract', label: 'Contract Information', icon: Building2 },
            { id: 'closures', label: `Candidate Closures (${closures.length})`, icon: Users },
            { id: 'payments', label: `Payments (${payments.length})`, icon: CreditCard }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold transition shadow-sm cursor-pointer ${
                  isActive 
                    ? 'bg-rc-teal text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Contract Information */}
        {activeTab === 'contract' && (
          <div className="mt-6 space-y-6 animate-fadeIn">
            
            {/* Section 1: Company Details */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/10 text-white border border-white/20">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">Company &amp; Master Details</h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <span>ID: {consultant.ConsultantId}</span>
                  <button
                    onClick={() => copyToClipboard(consultant.ConsultantId, 'id')}
                    className="text-slate-400 hover:text-white transition cursor-pointer"
                    title="Copy Consultant ID"
                  >
                    {copiedField === 'id' ? (
                      <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">Copied!</span>
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                {/* Consultant Name */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-slate-400 hover:shadow-sm transition-all border-l-[3px] border-l-slate-800">
                  <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Consultant Name</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-sm font-bold text-slate-900">{consultant.ConsuName || '-'}</span>
                  </div>
                </div>

                {/* Consultant Type */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-slate-400 hover:shadow-sm transition-all border-l-[3px] border-l-slate-800">
                  <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Consultant Type</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-sm font-bold text-slate-900">{consultant.ConsuType || '-'}</span>
                  </div>
                </div>

                {/* Module Access Flags */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-rc-teal/40 hover:shadow-sm transition-all border-l-[3px] border-l-rc-teal">
                  <div className="px-4 py-2 bg-rc-indigo-50 border-b border-rc-indigo-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rc-teal">Module Access Flags</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white flex items-center gap-1.5 flex-wrap">
                    {hasTa && <span className="inline-flex items-center rounded-full bg-rc-indigo-50 border border-rc-indigo-200 px-3 py-0.5 text-xs font-semibold text-rc-teal shadow-sm">TA</span>}
                    {hasTm && <span className="inline-flex items-center rounded-full bg-rc-indigo-50 border border-rc-indigo-200 px-3 py-0.5 text-xs font-semibold text-rc-teal shadow-sm">TM</span>}
                    {hasLd && <span className="inline-flex items-center rounded-full bg-rc-indigo-50 border border-rc-indigo-200 px-3 py-0.5 text-xs font-semibold text-rc-teal shadow-sm">L&amp;D</span>}
                    {hasOd && <span className="inline-flex items-center rounded-full bg-rc-indigo-50 border border-rc-indigo-200 px-3 py-0.5 text-xs font-semibold text-rc-teal shadow-sm">OD</span>}
                    {!hasTa && !hasTm && !hasLd && !hasOd && <span className="text-xs font-bold text-slate-500">None</span>}
                  </div>
                </div>

                {/* Engagement Type */}
                <div className="rounded-xl border border-amber-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-amber-500">
                  <div className="px-4 py-2 bg-amber-50/90 border-b border-amber-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">Engagement Type</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-3 py-0.5 text-xs font-semibold text-amber-900 shadow-sm">
                      {consultant.EngageType || '-'}
                    </span>
                  </div>
                </div>

                {/* PAN Number */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-slate-400 hover:shadow-sm transition-all border-l-[3px] border-l-slate-700">
                  <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">PAN Number</span>
                    {consultant.PanNumber && (
                      <button
                        onClick={() => copyToClipboard(consultant.PanNumber, 'pan')}
                        className="text-slate-400 hover:text-rc-teal transition cursor-pointer"
                        title="Copy PAN"
                      >
                        {copiedField === 'pan' ? (
                          <span className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider">Copied!</span>
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300 inline-block shadow-sm">
                      {consultant.PanNumber || '-'}
                    </span>
                  </div>
                </div>

                {/* GST Number */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-slate-400 hover:shadow-sm transition-all border-l-[3px] border-l-slate-700">
                  <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">GST Number</span>
                    {consultant.GstNumber && (
                      <button
                        onClick={() => copyToClipboard(consultant.GstNumber, 'gst')}
                        className="text-slate-400 hover:text-rc-teal transition cursor-pointer"
                        title="Copy GST"
                      >
                        {copiedField === 'gst' ? (
                          <span className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider">Copied!</span>
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300 inline-block shadow-sm">
                      {consultant.GstNumber || '-'}
                    </span>
                  </div>
                </div>

                {/* Dummy Vendor Code */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-rc-teal hover:shadow-sm transition-all border-l-[3px] border-l-rc-teal">
                  <div className="px-4 py-2 bg-rc-indigo-50 border-b border-rc-indigo-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rc-teal">Dummy Vendor Code</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="font-mono text-xs font-bold text-rc-teal bg-rc-indigo-50 px-3 py-1 rounded-lg border border-rc-indigo-200 inline-block shadow-sm">
                      {consultant.DummyVendor || '-'}
                    </span>
                  </div>
                </div>

                {/* Actual SAP Vendor Code */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-rc-teal hover:shadow-sm transition-all border-l-[3px] border-l-rc-teal">
                  <div className="px-4 py-2 bg-rc-indigo-50 border-b border-rc-indigo-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rc-teal">Actual Vendor Code</span>
                  </div>
                  <div className="px-4 py-2 bg-white">
                    <div className="flex items-center gap-2">
                      <input
                        className="rc-input w-full bg-slate-50 font-mono text-xs font-bold text-slate-900 border-slate-300 focus:border-rc-teal focus:ring-2 focus:ring-rc-teal/20 shadow-sm h-8 p-2"
                        placeholder="e.g. VEND1234"
                        maxLength={15}
                        value={vendorCode}
                        onChange={(e) => setVendorCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveVendorCode(); } }}
                      />
                      {/* 40px on phones for a comfortable thumb target, back to 32px from the
                          `sm` breakpoint up so it stays flush with the h-8 input on desktop —
                          the desktop layout is unchanged. touch-manipulation drops the 300ms
                          tap delay on mobile. */}
                      <button
                        type="button"
                        onClick={saveVendorCode}
                        disabled={!vendorCodeDirty || vendorSaving}
                        title={vendorCodeDirty ? 'Save vendor code' : 'No changes to save'}
                        aria-label="Save vendor code"
                        className="shrink-0 grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-lg border border-rc-teal bg-rc-teal text-white shadow-sm transition-all touch-manipulation hover:bg-rc-teal-dark disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {vendorSaving
                          ? <span className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          : <Check className="h-5 w-5 sm:h-4 sm:w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Contact Information */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/10 text-emerald-200 border border-white/20">
                    <Phone className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">Contact Information</h3>
                </div>
              </div>

              <div className="p-6 grid gap-4 md:grid-cols-2">
                {/* Contact Person */}
                <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-emerald-600">
                  <div className="px-4 py-2 bg-emerald-50/90 border-b border-emerald-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">Contact Person</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-sm font-bold text-slate-900">{consultant.ContactPers || '-'}</span>
                  </div>
                </div>

                {/* Contact Email */}
                <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-emerald-600">
                  <div className="px-4 py-2 bg-emerald-50/90 border-b border-emerald-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">Contact Email</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <a href={`mailto:${consultant.ContactEmail}`} className="text-sm font-bold text-rc-teal hover:underline">
                      {consultant.ContactEmail || '-'}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Contract & Fees */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/10 text-white border border-white/20">
                    <FileSignature className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">Contract &amp; Fees Terms</h3>
                </div>
              </div>

              <div className="p-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {/* Contract Start */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-rc-teal">
                  <div className="px-4 py-2 bg-rc-indigo-50 border-b border-rc-indigo-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rc-teal">Contract Start</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-sm font-bold text-slate-900">{formatDate(consultant.ContStart) || '-'}</span>
                  </div>
                </div>

                {/* Contract End */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-rc-teal">
                  <div className="px-4 py-2 bg-rc-indigo-50 border-b border-rc-indigo-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rc-teal">Contract End</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-sm font-bold text-slate-900">{formatDate(consultant.ContEnd) || '-'}</span>
                  </div>
                </div>

                {/* Fee Type */}
                <div className="rounded-xl border border-purple-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-purple-600">
                  <div className="px-4 py-2 bg-purple-50/90 border-b border-purple-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">Fee Type</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="inline-flex items-center rounded-full bg-purple-100 border border-purple-300 px-3 py-0.5 text-xs font-semibold text-purple-900 shadow-sm">
                      {consultant.FeeType || '-'}
                    </span>
                  </div>
                </div>

                {/* Fee Value */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-rc-teal">
                  <div className="px-4 py-2 bg-rc-indigo-50 border-b border-rc-indigo-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rc-teal">Fee Value</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-base font-bold text-rc-teal">
                      {consultant.FeeType === 'PERCENT_CTC' ? `${consultant.FeeValue}%` : formatCurrency(consultant.FeeValue || 0)}
                    </span>
                  </div>
                </div>

                {/* Payment Terms */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-slate-700">
                  <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Payment Terms</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className="text-sm font-bold text-slate-900">
                      {consultant.PaytTerms ? (consultant.PaytTerms === 'CUSTOM' ? 'Custom' : `${consultant.PaytTerms} Days`) : '-'}
                    </span>
                  </div>
                </div>

                {/* Replacement Clause */}
                <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden shadow-sm hover:shadow-sm transition-all border-l-[3px] border-l-emerald-600">
                  <div className="px-4 py-2 bg-emerald-50/90 border-b border-emerald-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">Replacement Clause</span>
                  </div>
                  <div className="px-4 py-3.5 bg-white">
                    <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold border shadow-sm ${
                      consultant.ReplcPeriod ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-slate-200 text-slate-700 border-slate-300'
                    }`}>
                    {consultant.ReplcPeriod ? `Yes (${consultant.ReplcPeriod} days)` : 'No'}
                    </span>
                  </div>
                </div>
              </div>
          </div>

          {/* Section 3.5: CTC Slab Matrix (Visible only for PERCENT_CTC) */}
          {consultant.FeeType === 'PERCENT_CTC' && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/10 text-white border border-white/20">
                    <FileText className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">CTC Slab Matrix</h3>
                </div>

                {isSuperadmin && (
                  <button 
                    onClick={handleOpenSlabEdit}
                    className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 text-xs font-bold transition border border-white/20 cursor-pointer shadow-sm active:scale-95"
                    title="Edit CTC Slab Matrix (FEESSET_UPDATE_ENTITY)"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-white" /> Edit CTC Slabs
                  </button>
                )}
              </div>

              <div className="p-6">
                {slabs.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 font-medium text-xs">
                    No slab configuration records found for this consultant.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="min-w-full text-xs text-slate-700">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3 text-left">From CTC Amount (₹)</th>
                          <th className="px-5 py-3 text-left">To CTC Amount (₹)</th>
                          <th className="px-5 py-3 text-left">Fee Percentage (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white font-semibold">
                        {slabs.map((slab) => (
                          <tr key={slab.FeeId} className="hover:bg-slate-50">
                            <td className="px-5 py-3.5 text-slate-900">{formatCurrency(slab.FromAmount || 0)}</td>
                            <td className="px-5 py-3.5 text-slate-900">
                              {Number(slab.ToAmount || 0) === 0 || Number(slab.ToAmount) >= 99999999
                                ? 'And Above'
                                : formatCurrency(slab.ToAmount)}
                            </td>
                            <td className="px-5 py-3.5 text-rc-teal font-bold">{slab.FeePersent || slab.FeePercent || 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}



          </div>
        )}

        {/* Tab 2: Candidate Closures */}
        {activeTab === 'closures' && (
          <div className="mt-6 animate-fadeIn">
            {closures.length === 0 ? (
              <div className="py-16 text-center text-slate-500 font-bold text-sm">
                No candidate closures logged for this consultant yet.
              </div>
            ) : (
              <>
                {/* Desktop View: Table */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-semibold tracking-wider text-xs uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3.5">Candidate Name</th>
                        <th className="px-5 py-3.5">Designation</th>
                        <th className="px-5 py-3.5">CTC Offered</th>
                        <th className="px-5 py-3.5">DOJ</th>
                        <th className="px-5 py-3.5">Band / Grade</th>
                        <th className="px-5 py-3.5">Invoice Amount</th>
                        <th className="px-5 py-3.5">Payment Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white">
                      {closures.map((item, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                          <tr 
                            key={item.ClosureId} 
                            className={`cursor-pointer transition-colors ${isEven ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-50'}`}
                            onClick={() => navigate(`/closure/${consultantId}/${item.ClosureId}`, { state: { closureData: item, consultantData: consultant } })}
                          >
                            <td className="px-5 py-4 font-semibold text-slate-900">{item.CandName}</td>
                            <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.Designation}</td>
                            <td className="px-5 py-4 text-xs font-bold text-slate-800">{formatCurrency(item.CtcOffered)}</td>
                            <td className="px-5 py-4 text-xs font-semibold text-slate-600">{formatDate(item.Doj)}</td>
                            <td className="px-5 py-4 text-xs font-bold text-slate-700">{item.BandGrade}</td>
                            <td className="px-5 py-4 font-bold text-slate-900">{formatCurrency(item.InvAmount)}</td>
                            <td className="px-5 py-4">
                              <span className={`rc-status-pill text-xs font-semibold ${paymentStatusColor(item.PaymentStatus)}`}>
                                {paymentStatusText(item.PaymentStatus)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: Cards */}
                <div className="block md:hidden space-y-4">
                  {closures.map((item) => (
                    <div 
                      key={item.ClosureId}
                      onClick={() => navigate(`/closure/${consultantId}/${item.ClosureId}`, { state: { closureData: item, consultantData: consultant } })}
                      className="rounded-xl border border-slate-200 bg-white p-5 transition-all cursor-pointer hover:border-rc-teal/40 relative overflow-hidden shadow-sm hover:shadow-sm space-y-3.5"
                    >
                      {/* Accent top strip */}
                      <div className="absolute top-0 left-0 right-0 h-1 bg-rc-teal" />
                      
                      {/* Header Row: Candidate Name and Status Pill */}
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-base font-bold text-slate-900 tracking-tight">{item.CandName}</h4>
                        <span className={`rc-status-pill text-[10px] px-2 py-0.5 font-semibold uppercase ${paymentStatusColor(item.PaymentStatus)}`}>
                          {paymentStatusText(item.PaymentStatus)}
                        </span>
                      </div>

                      {/* Content Grid */}
                      <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-100 pt-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Designation</span>
                          <span className="font-semibold text-slate-700">{item.Designation || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Band / Grade</span>
                          <span className="font-semibold text-slate-700">{item.BandGrade || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">CTC Offered</span>
                          <span className="font-semibold text-slate-800">{formatCurrency(item.CtcOffered)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">DOJ</span>
                          <span className="font-semibold text-slate-600">{formatDate(item.Doj)}</span>
                        </div>
                      </div>

                      {/* Invoice Row */}
                      <div className="flex items-center justify-between bg-rc-indigo-50/60 rounded-xl px-4 py-2.5 border border-rc-indigo-100">
                        <span className="text-[11px] font-bold uppercase text-rc-teal tracking-wider">Invoice Amount</span>
                        <span className="font-bold text-sm text-slate-900">{formatCurrency(item.InvAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 3: Payments */}
        {activeTab === 'payments' && (
          <div className="mt-6 animate-fadeIn">
            {payments.length === 0 ? (
              <div className="py-16 text-center text-slate-500 font-bold text-sm">
                No payment or invoice records found for this consultant.
              </div>
            ) : (
              <>
                {/* Desktop View: Table */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-semibold tracking-wider text-xs uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3.5">Invoice #</th>
                        <th className="px-5 py-3.5">Inv Date</th>
                        <th className="px-5 py-3.5">Inv Amount</th>
                        <th className="px-5 py-3.5">Pay Date</th>
                        <th className="px-5 py-3.5">UTR Number</th>
                        <th className="px-5 py-3.5">Pay Amount</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white">
                      {payments.map((item, idx) => {
                        const isEven = idx % 2 === 0;
                        const isPaid = (item.PaymtStatus || '').trim().toUpperCase() === 'X';
                        return (
                          <tr key={item.InvNumber} className={`transition-colors ${isEven ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-50'}`}>
                            <td className="px-5 py-4 font-mono text-xs font-semibold text-rc-teal">{item.InvNumber}</td>
                            <td className="px-5 py-4 text-xs font-semibold text-slate-600">{formatDate(item.InvDate)}</td>
                            <td className="px-5 py-4 text-xs font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>{formatCurrency(item.InvAmount)}</span>
                                {(item.VarianceFlag === 'X' || (item.VariancePct && Number(item.VariancePct) > 2)) && (
                                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" title={`Variance Warning: Invoice differs from calculated fee by ${item.VariancePct}%`} />
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-xs font-semibold text-slate-600">{formatDate(item.Budat) || '-'}</td>
                            <td className="px-5 py-4 font-mono text-xs font-bold text-slate-700">{item.Kidno || '-'}</td>
                            <td className="px-5 py-4 font-bold text-slate-900">{formatCurrency(item.PayAmount)}</td>
                            <td className="px-5 py-4">
                              <span className={`rc-status-pill text-xs font-semibold ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                {isPaid ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button 
                                onClick={() => downloadInvoice(item)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rc-indigo-200 bg-rc-indigo-50 px-3 py-1.5 text-xs font-semibold text-rc-teal hover:bg-rc-teal hover:text-white transition shadow-sm cursor-pointer"
                              >
                                <FileText className="h-3.5 w-3.5" /> PDF
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: Cards */}
                <div className="block md:hidden space-y-4">
                  {payments.map((item) => {
                    const isPaid = (item.PaymtStatus || '').trim().toUpperCase() === 'X';
                    return (
                      <div 
                        key={item.InvNumber}
                        className="rounded-xl border border-slate-200 bg-white p-5 hover:border-rc-teal/40 relative overflow-hidden shadow-sm hover:shadow-sm space-y-3.5"
                      >
                        {/* Accent top strip */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-rc-teal" />

                        {/* Header Row: Invoice ID and Status Pill */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-4.5 w-4.5 text-rc-teal" />
                            <span className="font-mono text-xs font-bold text-rc-teal tracking-tight">{item.InvNumber}</span>
                          </div>
                          <span className={`rc-status-pill text-[10px] px-2 py-0.5 font-semibold uppercase ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {isPaid ? 'Paid' : 'Pending'}
                          </span>
                        </div>

                        {/* Content Grid */}
                        <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-100 pt-3">
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Invoice Date</span>
                            <span className="font-semibold text-slate-600">{formatDate(item.InvDate)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Invoice Amount</span>
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              {formatCurrency(item.InvAmount)}
                              {(item.VarianceFlag === 'X' || (item.VariancePct && Number(item.VariancePct) > 2)) && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" title={`Variance Warning: Invoice differs from calculated fee by ${item.VariancePct}%`} />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Payment Date</span>
                            <span className="font-semibold text-slate-600">{formatDate(item.Budat) || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">UTR Number</span>
                            <span className="font-mono text-xs font-semibold text-slate-700">{item.Kidno || '-'}</span>
                          </div>
                        </div>

                      {/* Payment Amount & Action Button */}
                      <div className="flex items-center justify-between pt-3.5 border-t border-slate-100 gap-4">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Payment Amount</span>
                          <span className="font-bold text-sm text-slate-900">{formatCurrency(item.PayAmount)}</span>
                        </div>
                        
                        <button 
                          onClick={() => downloadInvoice(item)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rc-indigo-200 bg-rc-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-rc-teal hover:bg-rc-teal hover:text-white transition shadow-sm cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

      </div>
      <SuccessModal 
        isOpen={Boolean(successModalData)} 
        title={successModalData?.title} 
        message={successModalData?.message} 
        onClose={() => setSuccessModalData(null)} 
      />
      <ConfirmModal 
        open={showConfirmModal}
        title="Confirm Inactivation"
        message="Are you sure you want to set this consultant to Inactive? This consultant will not be able to log new closures until reactivated."
        onConfirm={() => executeStatusChange(pendingStatus)}
        onCancel={() => {
          setShowConfirmModal(false);
          setPendingStatus(null);
        }}
      />

      {/* Edit CTC Slabs Modal for Superadmin */}
      {isEditingSlabs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/10 text-white border border-white/20">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-white">Edit CTC Slab Matrix</h3>
                  <p className="text-xs font-medium text-slate-300">Configure fee percentage brackets (SAP FEESSET_UPDATE_ENTITY)</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditingSlabs(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {slabModalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{slabModalError}</span>
                </div>
              )}

              <div className="space-y-3">
                {tempSlabs.map((slab, index) => (
                  <div key={index} className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        From CTC (₹)
                      </label>
                      <input 
                        type="number" 
                        value={slab.FromAmount}
                        onChange={(e) => {
                          const newSlabs = [...tempSlabs];
                          newSlabs[index].FromAmount = e.target.value;
                          setTempSlabs(newSlabs);
                        }}
                        placeholder="e.g. 10000"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-rc-teal focus:ring-2 focus:ring-rc-teal/20 focus:outline-none"
                      />
                    </div>

                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        To CTC (₹)
                      </label>
                      <input 
                        type="number" 
                        value={Number(slab.ToAmount) >= 99999999 ? '' : slab.ToAmount}
                        onChange={(e) => {
                          const newSlabs = [...tempSlabs];
                          newSlabs[index].ToAmount = e.target.value;
                          setTempSlabs(newSlabs);
                        }}
                        placeholder="Blank = And Above"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-rc-teal focus:ring-2 focus:ring-rc-teal/20 focus:outline-none"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Fee (%)
                      </label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={slab.FeePercent || slab.FeePersent || ''}
                        onChange={(e) => {
                          const newSlabs = [...tempSlabs];
                          newSlabs[index].FeePercent = e.target.value;
                          setTempSlabs(newSlabs);
                        }}
                        placeholder="e.g. 8.5"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-rc-teal focus:border-rc-teal focus:ring-2 focus:ring-rc-teal/20 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button 
                type="button"
                onClick={() => setIsEditingSlabs(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isSavingSlabs}
                onClick={handleSaveSlabs}
                className="flex items-center gap-2 rounded-xl bg-rc-teal hover:bg-rc-teal-dark px-5 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50 transition cursor-pointer"
              >
                {isSavingSlabs ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Saving to SAP...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Save Changes
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
