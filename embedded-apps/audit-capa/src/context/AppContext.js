import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  createAudit,
  getAudits,
} from "../utils/storage";

const AppContext = createContext();

export const AppProvider = ({ children }) => {

  const [audits, setAudits] = useState([]);
  const [loadingAudits, setLoadingAudits] =
    useState(true);

  const loadAudits = async () => {

    try {

      setLoadingAudits(true);

      const data = await getAudits();

      setAudits(data);

    } catch (error) {

      console.error(
        "Unable to load audits:",
        error
      );

    } finally {

      setLoadingAudits(false);

    }
  };

  useEffect(() => {
    loadAudits();
  }, []);

  // const addAudit = async (audit) => {

  //   const created =
  //     await createAudit(audit);

  //   setAudits((previous) => [
  //     ...previous,
  //     created,
  //   ]);

  //   return created;
  // };

  const addAudit = async (audit) => {
    const data = await createAudit(audit);

    setAudits((prev) => [
      ...prev,
      data,
    ]);

    return data;
  };

  return (
    <AppContext.Provider
      value={{
        audits,
        setAudits,
        addAudit,
        refreshAudits: loadAudits,
        loadingAudits,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () =>
  useContext(AppContext);