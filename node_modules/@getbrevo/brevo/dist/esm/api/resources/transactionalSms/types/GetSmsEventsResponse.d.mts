export interface GetSmsEventsResponse {
    events?: GetSmsEventsResponse.Events.Item[] | undefined;
}
export declare namespace GetSmsEventsResponse {
    type Events = Events.Item[];
    namespace Events {
        interface Item {
            /** UTC date-time on which the event has been generated */
            date?: string | undefined;
            /** Event which occurred */
            event?: Item.Event | undefined;
            /** Message ID which generated the event */
            messageId?: string | undefined;
            /** Phone number which has generated the event */
            phoneNumber?: string | undefined;
            /** Reason of bounce (only available if the event is hardbounce or softbounce) */
            reason?: string | undefined;
            reply?: string | undefined;
            /** Tag of the SMS which generated the event */
            tag?: string | undefined;
        }
        namespace Item {
            /** Event which occurred */
            const Event: {
                readonly Bounces: "bounces";
                readonly HardBounces: "hardBounces";
                readonly SoftBounces: "softBounces";
                readonly Delivered: "delivered";
                readonly Sent: "sent";
                readonly Accepted: "accepted";
                readonly Unsubscription: "unsubscription";
                readonly Replies: "replies";
                readonly Blocked: "blocked";
                readonly Rejected: "rejected";
                readonly Skipped: "skipped";
            };
            type Event = (typeof Event)[keyof typeof Event];
        }
    }
}
