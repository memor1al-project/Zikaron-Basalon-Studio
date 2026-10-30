import { Navigate, Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import { firebaseConfigured } from "./lib/firebase";
import { useAnalytics } from "./lib/analytics";
import { RequireAuth, RequireProfile } from "./app/guards";
import { SignIn } from "./features/auth/SignIn";
import { ProfilePage } from "./features/profile/ProfilePage";
import { CollectionSessionProvider } from "./features/collection/CollectionSessionContext";
import { ConnectStep } from "./features/collection/ConnectStep";
import { MaterialsStep } from "./features/collection/MaterialsStep";
import { StorySectionPage } from "./features/collection/StorySectionPage";
import { FamilyTreePage } from "./features/familytree/FamilyTreePage";
import { SummaryPage } from "./features/collection/SummaryPage";
import { CatalogPage } from "./features/collection/CatalogPage";
import { ExampleStoriesPage } from "./features/presentation/ExampleStoriesPage";
import { ExampleTestimonyPage } from "./features/presentation/ExampleTestimonyPage";
import { ExampleStoryPage } from "./features/presentation/ExampleStoryPage";
import { ConversationPage } from "./features/presentation/ConversationPage";
import { ResourcesPage } from "./features/resources/ResourcesPage";
import { TutorialPage } from "./features/tutorial/TutorialPage";
import { IssueReporter } from "./features/report/IssueReporter";

/**
 * A nested <Outlet> does NOT automatically forward its parent's outlet
 * context — it must be re-passed explicitly, or descendants relying on
 * useOutletContext() (RequireProfile, ProfilePage) get undefined.
 */
function CollectionSessionLayout() {
  const authContext = useOutletContext<{ user: User }>();
  return (
    <CollectionSessionProvider uid={authContext.user.uid}>
      <Outlet context={authContext} />
    </CollectionSessionProvider>
  );
}

function App() {
  // Must run before the early return below, or hooks would be conditional.
  useAnalytics();

  if (!firebaseConfigured) {
    return (
      <div style={{ maxWidth: 480, margin: "96px auto", textAlign: "center" }}>
        <h1>Zikaron BaSalon Story Studio</h1>
        <p>
          Firebase isn't configured yet. Fill in <code>app/.env.local</code> from the
          Firebase console, then restart <code>npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Outside <Routes> so a staged report survives moving between screens, and so
          the picker can point at the chrome as readily as at a page. */}
      <IssueReporter />

      <Routes>
        <Route path="/sign-in" element={<SignIn />} />

        <Route element={<RequireAuth />}>
          <Route element={<CollectionSessionLayout />}>
            <Route path="/profile" element={<ProfilePage />} />

            <Route element={<RequireProfile />}>
              <Route path="/collection" element={<Navigate to="/collection/connect" replace />} />
              <Route path="/collection/connect" element={<ConnectStep />} />
              <Route path="/collection/materials" element={<MaterialsStep />} />
              <Route path="/collection/familytree" element={<FamilyTreePage />} />
              <Route path="/collection/story" element={<Navigate to="/collection/story/scene" replace />} />
              <Route path="/collection/story/:slug" element={<StorySectionPage />} />
              <Route path="/collection/summary" element={<SummaryPage />} />
              <Route path="/collection/catalog" element={<CatalogPage />} />
            </Route>
          </Route>

        </Route>

        {/*
          The example stories are deliberately outside RequireAuth: anyone can explore real
          testimony and see how a story gets built before deciding to register. They read only
          bundled JSON, so there's no per-user data to protect here.
        */}
        {/* The organisation's own kits. Open to anyone: someone deciding whether to host
            an evening should be able to read what hosting involves without an account. */}
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/tutorial" element={<TutorialPage />} />

        <Route path="/presentation" element={<Navigate to="/presentation/examples" replace />} />
        <Route path="/presentation/examples" element={<ExampleStoriesPage />} />
        <Route path="/presentation/conversation" element={<ConversationPage />} />
        <Route path="/presentation/examples/:videoId" element={<ExampleTestimonyPage />} />
        <Route path="/presentation/examples/:videoId/story" element={<ExampleStoryPage />} />

        <Route path="/" element={<Navigate to="/presentation/examples" replace />} />
        <Route path="*" element={<Navigate to="/presentation/examples" replace />} />
      </Routes>
    </>
  );
}

export default App;
