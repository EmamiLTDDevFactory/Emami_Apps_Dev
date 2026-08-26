export const getCertification = (
  compliance
) => {

  const score =
    Number(compliance);

  if (score >= 95) {
    return {
      certification:
        "Platinum",
      rating: "★★★★★",
      color: "#22C55E",
    };
  }

  if (score >= 90) {
    return {
      certification:
        "Gold",
      rating: "★★★★",
      color: "#F59E0B",
    };
  }

  if (score >= 80) {
    return {
      certification:
        "Silver",
      rating: "★★★",
      color: "#94A3B8",
    };
  }

  if (score >= 70) {
    return {
      certification:
        "Bronze",
      rating: "★★",
      color: "#CD7F32",
    };
  }

  return {
    certification:
      "No Certificate",
    rating: "★",
    color: "#EF4444",
  };
};