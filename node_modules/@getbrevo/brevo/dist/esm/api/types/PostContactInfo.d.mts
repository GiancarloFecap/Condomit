export interface PostContactInfo {
    contacts: PostContactInfo.Contacts;
}
export declare namespace PostContactInfo {
    interface Contacts {
        failure?: Contacts.Failure | undefined;
        /** Id of the process created to remove contacts from list when user opts for "all" option. */
        processId?: number | undefined;
        success?: Contacts.Success | undefined;
        /** Displays the count of total number of contacts removed from list when user opts for "all" option. */
        total?: number | undefined;
    }
    namespace Contacts {
        type Failure = string[] | number[];
        type Success = string[] | number[];
    }
}
