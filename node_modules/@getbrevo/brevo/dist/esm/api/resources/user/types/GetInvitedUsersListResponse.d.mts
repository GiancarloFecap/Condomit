export interface GetInvitedUsersListResponse {
    /** Get invited users list */
    users?: GetInvitedUsersListResponse.Users.Item[] | undefined;
}
export declare namespace GetInvitedUsersListResponse {
    type Users = Users.Item[];
    namespace Users {
        interface Item {
            /** Email address of the user. */
            email: string;
            /** Feature accessiblity given to the user. */
            feature_access: Item.FeatureAccess;
            /** Flag for indicating is user owner of the organization. */
            is_owner: string;
            /** Status of the invited user. */
            status: string;
        }
        namespace Item {
            /**
             * Feature accessiblity given to the user.
             */
            interface FeatureAccess {
                /** Conversations features accessiblity. */
                conversations?: string | undefined;
                /** CRM features accessiblity. */
                crm?: string | undefined;
                /** Marketing features accessiblity. */
                marketing?: string | undefined;
            }
        }
    }
}
