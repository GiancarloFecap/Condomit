export interface PostPreviewSmtpEmailTemplatesResponse {
    /** Sender email address */
    fromEmail?: string | undefined;
    /** Sender Name */
    fromName?: string | undefined;
    /** Html content of the template */
    html?: string | undefined;
    /** Preview text of the template */
    previewText?: string | undefined;
    /** subject of the template */
    subject?: string | undefined;
    usedFeedNames?: string[] | undefined;
}
