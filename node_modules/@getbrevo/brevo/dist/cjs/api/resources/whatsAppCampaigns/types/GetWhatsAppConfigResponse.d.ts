export interface GetWhatsAppConfigResponse {
    /** Verification status information of the Business account */
    businessStatus?: string | undefined;
    /** Status of the name associated with WhatsApp Phone number */
    phoneNumberNameStatus?: GetWhatsAppConfigResponse.PhoneNumberNameStatus | undefined;
    /** Quality status of phone number associated with WhatsApp account. There are three quality ratings. example - **High (GREEN) , Medium (YELLOW) and Low(RED)** */
    phoneNumberQuality?: GetWhatsAppConfigResponse.PhoneNumberQuality | undefined;
    /** Sending limit of the WhatsApp account */
    sendingLimit?: string | undefined;
    /** Id of the WhatsApp business account */
    whatsappBusinessAccountId?: string | undefined;
    /** Status information related to WhatsApp Api account */
    whatsappBusinessAccountStatus?: GetWhatsAppConfigResponse.WhatsappBusinessAccountStatus | undefined;
}
export declare namespace GetWhatsAppConfigResponse {
    /** Status of the name associated with WhatsApp Phone number */
    const PhoneNumberNameStatus: {
        readonly Approved: "APPROVED";
        readonly Pending: "PENDING";
        readonly Rejected: "REJECTED";
    };
    type PhoneNumberNameStatus = (typeof PhoneNumberNameStatus)[keyof typeof PhoneNumberNameStatus];
    /** Quality status of phone number associated with WhatsApp account. There are three quality ratings. example - **High (GREEN) , Medium (YELLOW) and Low(RED)** */
    const PhoneNumberQuality: {
        readonly Green: "GREEN";
        readonly Yellow: "YELLOW";
        readonly Red: "RED";
    };
    type PhoneNumberQuality = (typeof PhoneNumberQuality)[keyof typeof PhoneNumberQuality];
    /** Status information related to WhatsApp Api account */
    const WhatsappBusinessAccountStatus: {
        readonly Approved: "APPROVED";
        readonly Pending: "PENDING";
        readonly Rejected: "REJECTED";
    };
    type WhatsappBusinessAccountStatus = (typeof WhatsappBusinessAccountStatus)[keyof typeof WhatsappBusinessAccountStatus];
}
