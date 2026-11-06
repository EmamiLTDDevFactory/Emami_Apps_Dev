'use strict';

// Columns and joins for ticket lists (Tickets screen and Board).
const LIST_COLUMNS = `t.id, t.subject, t."statusId", t.priority, t.severity, t.source, t.type, t."groupId", t."agentId", t.tags,
    t.category, t."function", t.region, t."distributorCode", t."distributorName", t."firstResponseDueAt", t."resolutionDueAt",
    t."firstRespondedAt", t."resolvedAt", t."closedAt", t."frViolated", t."resViolated", t."slaPausedAt", t."createdAt", t."updatedAt",
    t."lastActivityAt", t."lastActivityKind", t."lastActivityBy", t."lastActivityDetail",
    c.name AS "requesterName", c.email AS "requesterEmail", a.name AS "agentName", g.name AS "groupName",
    s.name AS "statusName", s."pausesSla", s."isResolved", s."isClosed"`;
const LIST_FROM = `FROM samadhan.tickets t
    JOIN samadhan.contacts c ON c.id = t."requesterId"
    JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
    LEFT JOIN samadhan.agents a ON a.id = t."agentId"
    LEFT JOIN samadhan.groups g ON g.id = t."groupId"`;

module.exports = { LIST_COLUMNS, LIST_FROM };
