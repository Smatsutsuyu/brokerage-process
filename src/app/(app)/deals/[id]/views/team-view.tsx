import {
  listDealContactsForTeamPicker,
  listDealTeam,
  listOrgUsersForTeamPicker,
} from "../actions";

import { TeamList } from "./team-list";

type TeamViewProps = {
  dealId: string;
};

export async function TeamView({ dealId }: TeamViewProps) {
  // Parallel load: roster + picker option lists.
  //   brokerUserOptions   = org users only. Outside cobrokers should
  //                         be added as users (via /admin/members)
  //                         even if no login is granted yet.
  //   buyerContactOptions = contacts ON THIS DEAL only (curated subset).
  const [members, brokerUsers, buyerContacts] = await Promise.all([
    listDealTeam({ dealId }),
    listOrgUsersForTeamPicker(),
    listDealContactsForTeamPicker({ dealId }),
  ]);
  return (
    <TeamList
      dealId={dealId}
      members={members}
      brokerUserOptions={brokerUsers}
      buyerContactOptions={buyerContacts}
    />
  );
}
