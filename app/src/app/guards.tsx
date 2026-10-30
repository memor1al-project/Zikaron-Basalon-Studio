import { useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import { useAuth } from "../features/auth/useAuth";
import { getProfile, type UserProfile } from "../features/profile/profileService";

/** Blocks any nested route until a signed-in user exists. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/sign-in" replace />;
  return <Outlet context={{ user } satisfies AuthOutletContext} />;
}

interface AuthOutletContext {
  user: User;
}

export function useAuthedUser(): User {
  return useOutletContext<AuthOutletContext>().user;
}

/** Blocks any nested route until the signed-in user has a saved profile. */
export function RequireProfile() {
  const { user } = useOutletContext<AuthOutletContext>();
  const [profile, setProfile] = useState<UserProfile | null | "loading">("loading");

  useEffect(() => {
    getProfile(user.uid).then(setProfile);
  }, [user.uid]);

  if (profile === "loading") return null;
  if (profile === null) return <Navigate to="/profile" replace />;

  return <Outlet context={{ user, profile } satisfies ProfileOutletContext} />;
}

interface ProfileOutletContext {
  user: User;
  profile: UserProfile;
}

export function useProfileContext(): ProfileOutletContext {
  return useOutletContext<ProfileOutletContext>();
}
