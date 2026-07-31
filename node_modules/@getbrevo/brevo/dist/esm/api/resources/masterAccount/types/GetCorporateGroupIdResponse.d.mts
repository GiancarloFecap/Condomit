export interface GetCorporateGroupIdResponse {
    group?: GetCorporateGroupIdResponse.Group | undefined;
    "sub-accounts"?: GetCorporateGroupIdResponse.SubAccounts.Item[] | undefined;
    users?: GetCorporateGroupIdResponse.Users.Item[] | undefined;
}
export declare namespace GetCorporateGroupIdResponse {
    interface Group {
        /** Group creation date */
        createdAt?: string | undefined;
        /** Name of the group */
        groupName?: string | undefined;
        /** Group id */
        id?: string | undefined;
    }
    type SubAccounts = SubAccounts.Item[];
    namespace SubAccounts {
        interface Item {
            /** Name of the sub-account organzation */
            companyName?: string | undefined;
            /** Creation date of the sub-account organzation */
            createdAt?: string | undefined;
            /** Id of the sub-account organzation */
            id?: number | undefined;
        }
    }
    type Users = Users.Item[];
    namespace Users {
        interface Item {
            /** Email address of the user */
            email?: string | undefined;
            /** First name of the user */
            firstName?: string | undefined;
            /** Last name of the user */
            lastName?: string | undefined;
        }
    }
}
