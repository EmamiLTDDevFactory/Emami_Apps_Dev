export const formatSapErrorMessage = (message?: string): string => {
  const rawMessage = (message || '').toString().trim();
  if (!rawMessage) {
    return 'The finance action could not be completed. Please try again.';
  }

  if (/taxes by item is not activated/i.test(rawMessage)) {
    return 'This claim cannot be released because tax handling is not yet configured for this document type in SAP. Please contact IT/Finance support and reference: "Tax-by-item not activated".';
  }

  if (/error in document/i.test(rawMessage)) {
    const documentError = rawMessage.split(':').slice(1).join(':').trim();
    return documentError
      ? `SAP document posting failed. ${documentError}`
      : 'SAP document posting failed. Please review the claim and try again.';
  }

  if (/sap rejected/i.test(rawMessage)) {
    return 'SAP rejected the request. Please check the claim data and try again.';
  }

  return rawMessage;
};
