import { useContext, useEffect, useState } from 'react';
import ConsultantAnalytics from '../components/ConsultantAnalytics';
import PageHeader from '../components/PageHeader';
import { AppContext } from '../context/AppContext';
import { getConsultants } from '../services/odataService';

export default function Analytics() {
  const { setBusy } = useContext(AppContext);
  const [consultants, setConsultants] = useState([]);

  useEffect(() => {
    async function load() {
      setBusy(true);
      try {
        const data = await getConsultants();
        setConsultants(data);
      } finally {
        setBusy(false);
      }
    }
    load();
  }, [setBusy]);

  return (
    <div className="space-y-6">
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">Visual breakdown of consultant status, engagement, and spend.</p>
        </div>
      </PageHeader>

      <ConsultantAnalytics consultants={consultants} />
    </div>
  );
}
