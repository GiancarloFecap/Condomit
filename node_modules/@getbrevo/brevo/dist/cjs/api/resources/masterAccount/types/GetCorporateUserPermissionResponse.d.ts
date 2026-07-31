/**
 * Check admin user permissions
 */
export interface GetCorporateUserPermissionResponse {
    /** Email address of the user. */
    email: string;
    /** Granular feature permissions given to the user. */
    feature_access: GetCorporateUserPermissionResponse.FeatureAccess;
    groups: GetCorporateUserPermissionResponse.Groups.Item[];
    /** Status of the invited user. */
    status: string;
}
export declare namespace GetCorporateUserPermissionResponse {
    /**
     * Granular feature permissions given to the user.
     */
    interface FeatureAccess {
        /** Permission on analytics */
        analytics?: string[] | undefined;
        /** Permission on api keys */
        api_keys?: string[] | undefined;
        /** Permission on apps management */
        apps_management?: string[] | undefined;
        /** Permission on create sub-accounts */
        create_sub_organizations?: string[] | undefined;
        /** Permission on manage sub-accounts */
        manage_sub_organizations?: string[] | undefined;
        /** Permission on my plan */
        my_plan?: string[] | undefined;
        /** Permission on groups */
        sub_organization_groups?: string[] | undefined;
        /** Permission on user management */
        user_management?: string[] | undefined;
    }
    type Groups = Groups.Item[];
    namespace Groups {
        /**
         * Groups details
         */
        interface Item {
            /** group identifier */
            id?: string | undefined;
            /** Group name */
            name?: string | undefined;
        }
    }
}
