import Auth from "../app/pages/auth/auth";

interface Routes {
  name: string;
  element: React.JSX.Element;
  childrens?: Routes[];
  hidden: boolean;
}

export const ROUTES: Routes[] = [
  { name: "auth", element: Auth(), hidden: false },
];
