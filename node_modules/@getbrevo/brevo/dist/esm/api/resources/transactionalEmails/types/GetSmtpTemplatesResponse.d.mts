import type * as Brevo from "../../../index.mjs";
export interface GetSmtpTemplatesResponse {
    /** Count of transactional email templates */
    count?: number | undefined;
    templates?: Brevo.GetSmtpTemplateOverview[] | undefined;
}
