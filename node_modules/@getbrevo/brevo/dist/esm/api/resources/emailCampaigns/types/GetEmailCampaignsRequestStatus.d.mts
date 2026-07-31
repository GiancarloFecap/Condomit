export declare const GetEmailCampaignsRequestStatus: {
    readonly Suspended: "suspended";
    readonly Archive: "archive";
    readonly Sent: "sent";
    readonly Queued: "queued";
    readonly Draft: "draft";
    readonly InProcess: "inProcess";
    readonly InReview: "inReview";
    readonly Cancelling: "cancelling";
    readonly Cancelled: "cancelled";
};
export type GetEmailCampaignsRequestStatus = (typeof GetEmailCampaignsRequestStatus)[keyof typeof GetEmailCampaignsRequestStatus];
