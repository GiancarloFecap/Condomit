/**
 * Status of the campaign
 */
export interface UpdateCampaignStatus {
    /** Note:- **replicateTemplate** status will be available **only for template type campaigns.** */
    status?: UpdateCampaignStatus.Status | undefined;
}
export declare namespace UpdateCampaignStatus {
    /** Note:- **replicateTemplate** status will be available **only for template type campaigns.** */
    const Status: {
        readonly Suspended: "suspended";
        readonly Archive: "archive";
        readonly Darchive: "darchive";
        readonly Sent: "sent";
        readonly Queued: "queued";
        readonly Replicate: "replicate";
        readonly ReplicateTemplate: "replicateTemplate";
        readonly Cancel: "cancel";
        readonly Draft: "draft";
    };
    type Status = (typeof Status)[keyof typeof Status];
}
