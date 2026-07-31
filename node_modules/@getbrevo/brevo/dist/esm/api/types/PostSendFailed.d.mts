export interface PostSendFailed {
    blackListedEmails?: string[] | undefined;
    /** Response code */
    code: string;
    /** Response message */
    message: string;
    unexistingEmails?: string[] | undefined;
    withoutListEmails?: string[] | undefined;
}
