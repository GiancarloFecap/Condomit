import type * as Brevo from "../../../index.js";
export interface GetSmtpTemplatesResponse {
    /** Count of transactional email templates */
    count?: number | undefined;
    templates?: Brevo.GetSmtpTemplateOverview[] | undefined;
}
