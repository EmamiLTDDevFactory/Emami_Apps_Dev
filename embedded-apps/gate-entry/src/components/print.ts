import { getPdf } from '@/lib/gate';

/** Opens the gate pass PDF from SAP in a new tab (the browser's viewer prints it). */
export async function openPdf(reqNo: string) {
  const tab = window.open('', '_blank'); // open synchronously so pop-up blockers allow it
  try {
    const url = URL.createObjectURL(await getPdf(reqNo));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
