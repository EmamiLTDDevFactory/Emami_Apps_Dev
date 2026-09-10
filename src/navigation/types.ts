import type { NavigatorScreenParams } from '@react-navigation/native';

export type DrawerParamList = {
  Home: undefined;
  MyApplications: undefined;
  Favorites: undefined;
  Recent: undefined;
  Help: undefined;
  Settings: undefined;
  UserAccess: undefined;
  SsoConfig: undefined;
  Administration: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<DrawerParamList>;
  AppDetail: { appId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
