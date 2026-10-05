"use client";
/** Port of view/ApprovalDialog.fragment.xml */
import React from "react";
import { Button, Dialog, MessageStrip } from "./ui/controls";

export function ApprovalDialog({
  open,
  reason,
  onReasonChange,
  onApprove,
  onReject,
  onCancel,
}: {
  open: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="Shelf-Life Deviation Review"
      contentWidth="700px"
      contentHeight="600px"
      onEscape={onCancel}
      buttons={
        <>
          <Button text="Approve" type="Accept" icon="accept" onPress={onApprove} />
          <Button text="Reject" type="Reject" icon="decline" onPress={onReject} />
          <Button text="Cancel" onPress={onCancel} />
        </>
      }
    >
      <div className="vbox sapUiMediumMargin">
        <MessageStrip
          text="Review the shelf-life deviation before approving or rejecting the inspection lot."
          type="Information"
          showIcon
          className="sapUiSmallMarginTop sapUiSmallMarginBottom"
        />

        <section className="panel sapUiSmallMarginTop">
          <header className="panel-header">Decision</header>
          <div className="vbox sapUiSmallMargin">
            <label className="label" htmlFor="rejectReason">
              Rejection Reason
            </label>
            <textarea
              id="rejectReason"
              className="textarea"
              rows={4}
              style={{ width: "100%" }}
              placeholder="Enter rejection reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </div>
        </section>
      </div>
    </Dialog>
  );
}
