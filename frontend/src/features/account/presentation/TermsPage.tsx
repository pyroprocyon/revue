import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { PolicyLinks } from '../../../shared/ui/PolicyLinks';
import { SupportLink } from '../../../shared/ui/SupportLink';
import { Screen } from '../../../shared/ui/Screen';

export function TermsPage() {
  return <Screen top={<HomeLink />}>
    <article className="space-y-5 pt-6 text-body">
      <h1 className="text-title font-extrabold tracking-tight">Pilot terms</h1>
      <p>Revue’s invited pilot is for adults aged 18 or older. Use your own account, keep your password and unused invitation private, and respect other learners and the sources credited on cards.</p>
      <p>This is early learning software. Features may change and cards may contain mistakes. Check the credited sources and report inaccuracies to <SupportLink />. Practice results do not guarantee exam or job outcomes.</p>
      <p>For account help or removal, email <SupportLink />. The privacy notice explains the information this pilot keeps.</p>
    </article>
    <PolicyLinks />
  </Screen>;
}
