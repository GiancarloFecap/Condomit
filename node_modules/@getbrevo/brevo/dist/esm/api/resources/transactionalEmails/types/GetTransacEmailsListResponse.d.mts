export interface GetTransacEmailsListResponse {
    /** Total number of transactional emails available on your account according to the passed filter */
    count?: number | undefined;
    transactionalEmails?: GetTransacEmailsListResponse.TransactionalEmails.Item[] | undefined;
}
export declare namespace GetTransacEmailsListResponse {
    type TransactionalEmails = TransactionalEmails.Item[];
    namespace TransactionalEmails {
        interface Item {
            /** Date on which transactional email was sent */
            date: string;
            /** Email address to which transactional email has been sent */
            email: string;
            /** Email address of the sender from which the email was sent */
            from?: string | undefined;
            /** Message Id of the sent email */
            messageId: string;
            /** Subject of the sent email */
            subject: string;
            /** Tags used for your email */
            tags?: string[] | undefined;
            /** Id of the template */
            templateId?: number | undefined;
            /** Unique id of the email sent to a particular contact */
            uuid: string;
        }
    }
}
