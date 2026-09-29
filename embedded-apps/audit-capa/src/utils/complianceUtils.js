// Single source of truth for audit compliance %: points-based, the same figure
// the "Element Compliance" table on the checklist shows.
//   compliance = sum(actualScore) / sum(maxScore) * 100, NA questions excluded.
export const calculateCompliance = (checklist = []) => {
    const applicable = (checklist || []).filter(
        (item) => item.status !== "NA"
    );

    const maxPoints = applicable.reduce(
        (sum, item) => sum + Number(item.maxScore || 0),
        0
    );

    const actualPoints = applicable.reduce(
        (sum, item) => sum + Number(item.actualScore || 0),
        0
    );

    return maxPoints === 0
        ? "0.00"
        : ((actualPoints / maxPoints) * 100).toFixed(2);
};

// Audits saved before this fix stored a question-count % (questions scoring >= 2
// / applicable questions), which disagrees with the checklist. Derive the value
// from the saved checklist on read so every page shows the checklist's figure —
// display only, nothing is written back to the database.
export const withChecklistCompliance = (audit) => {
    if (
        !audit ||
        !Array.isArray(audit.checklist) ||
        audit.checklist.length === 0
    ) {
        return audit;
    }

    return {
        ...audit,
        compliance: Number(calculateCompliance(audit.checklist)),
    };
};

// Per-element breakdown, identical to the checklist's "Element Compliance"
// table (points-based, NA excluded, category order as first seen).
export const calculateCategoryCompliance = (checklist = []) => {
    const byCategory = (checklist || []).reduce((acc, item) => {
        const category = item.category || "Others";

        if (!acc[category]) {
            acc[category] = { maxPoints: 0, actualPoints: 0 };
        }

        if (item.status !== "NA") {
            acc[category].maxPoints += Number(item.maxScore || 0);
            acc[category].actualPoints += Number(item.actualScore || 0);
        }

        return acc;
    }, {});

    const rows = Object.entries(byCategory).map(([category, data]) => ({
        category,
        maxPoints: data.maxPoints,
        actualPoints: data.actualPoints,
        compliance:
            data.maxPoints === 0
                ? "0.00"
                : ((data.actualPoints / data.maxPoints) * 100).toFixed(2),
    }));

    return {
        rows,
        totalMaxPoints: rows.reduce((sum, row) => sum + row.maxPoints, 0),
        totalActualPoints: rows.reduce((sum, row) => sum + row.actualPoints, 0),
        totalCompliance: calculateCompliance(checklist),
    };
};
