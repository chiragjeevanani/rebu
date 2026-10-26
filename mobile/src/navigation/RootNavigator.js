import React, { useEffect } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import TabBar from './TabBar';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import EmailAuthScreen from '../screens/auth/EmailAuthScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ProfileSetupScreen from '../screens/setup/ProfileSetupScreen';

import {
  ExploreScreen,
  FollowingScreen,
  ForYouScreen,
  HostListScreen,
} from '../screens/feed/FeedScreens';
import CoinsScreen from '../screens/coins/CoinsScreen';
import LiveRoomScreen from '../screens/live/LiveRoomScreen';
import MatchScreen from '../screens/match/MatchScreen';
import RandomCallScreen from '../screens/match/RandomCallScreen';
import HostProfileScreen from '../screens/host/HostProfileScreen';
import MomentsScreen from '../screens/moments/MomentsScreen';
import CreateMomentScreen from '../screens/moments/CreateMomentScreen';
import RoomsScreen from '../screens/rooms/RoomsScreen';
import RoomScreen from '../screens/rooms/RoomScreen';
import CreateRoomScreen from '../screens/rooms/CreateRoomScreen';
import {
  LeaderboardScreen,
  SearchScreen,
} from '../screens/home/DiscoverExtras';
import { AristocracyScreen, VipScreen } from '../screens/me/MembershipScreens';
import {
  DiamondsScreen,
  FamilyScreen,
  TasksScreen,
  VisitorsScreen,
} from '../screens/me/ToolScreens';
import {
  BackpackScreen,
  EventCenterScreen,
  StoreScreen,
} from '../screens/me/ShopScreens';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import CallScreen from '../screens/call/CallScreen';
import CallEndedScreen from '../screens/call/CallEndedScreen';
import CallHistoryScreen from '../screens/call/CallHistoryScreen';
import IncomingCallScreen from '../screens/call/IncomingCallScreen';
import MyProfileScreen from '../screens/profile/MyProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import NotificationsScreen from '../screens/profile/NotificationsScreen';
import DeleteAccountScreen from '../screens/profile/DeleteAccountScreen';
import {
  BlockedUsersScreen,
  ContentScreen,
  FollowersScreen,
  ReportScreen,
  VerificationScreen,
} from '../screens/profile/MiscScreens';
import WalletScreen from '../screens/wallet/WalletScreen';
import HostDashboardScreen from '../screens/wallet/HostDashboardScreen';
import WithdrawScreen from '../screens/wallet/WithdrawScreen';
import TransactionsScreen from '../screens/wallet/TransactionsScreen';
import BecomeHostScreen from '../screens/wallet/BecomeHostScreen';
import HostApplyScreen from '../screens/host/HostApplyScreen';
import HostStatusScreen from '../screens/host/HostStatusScreen';
import HostCenterScreen from '../screens/host/HostCenterScreen';
import GoLiveScreen from '../screens/live/GoLiveScreen';
import MyLiveScreen from '../screens/live/MyLiveScreen';
import LiveSummaryScreen from '../screens/live/LiveSummaryScreen';

const Stack = createNativeStackNavigator();
const Tab = createMaterialTopTabNavigator();
const renderTabBar = props => <TabBar {...props} />;
const LazyPlaceholder = () => (
  <View style={{ flex: 1, backgroundColor: colors.background }} />
);

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
  },
};

// Approved hosts get their Host Center as a tab instead of Coins
// (coins stay one tap away via the balance pill in the top bar).
const HostTabScreen = props => <HostCenterScreen {...props} tab />;

function MainTabs() {
  const { isHost } = useApp();
  return (
    // Pager-style tabs: swipe left/right between pages.
    <Tab.Navigator
      tabBarPosition="bottom"
      tabBar={renderTabBar}
      screenOptions={{
        lazy: true,
        lazyPreloadDistance: 1,
        lazyPlaceholder: LazyPlaceholder,
      }}
    >
      <Tab.Screen name="ForYou" component={ForYouScreen} />
      <Tab.Screen name="Following" component={FollowingScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      {isHost ? (
        <Tab.Screen name="HostTab" component={HostTabScreen} />
      ) : (
        <Tab.Screen name="Coins" component={CoinsScreen} />
      )}
      <Tab.Screen name="Chats" component={ChatListScreen} />
    </Tab.Navigator>
  );
}

const immersive = { animation: 'fade', presentation: 'fullScreenModal' };

const navigationRef = createNavigationContainerRef();

export default function RootNavigator() {
  const { hydrated, authed, incomingCall, setIncomingCall } = useApp();

  // Ring the host wherever she is in the app.
  useEffect(() => {
    if (!incomingCall || !authed || !navigationRef.isReady()) return;
    navigationRef.navigate('IncomingCall', { caller: incomingCall });
    setIncomingCall(null);
  }, [incomingCall, authed, setIncomingCall]);

  // Wait for the saved session so the login screen doesn’t flash on launch.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!authed ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
            <Stack.Screen name="EmailAuth" component={EmailAuthScreen} />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
            />
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Me" component={MyProfileScreen} />
            <Stack.Screen name="Moments" component={MomentsScreen} />
            <Stack.Screen name="Rooms" component={RoomsScreen} />
            <Stack.Screen name="HostList" component={HostListScreen} />
            <Stack.Screen
              name="LiveRoom"
              component={LiveRoomScreen}
              options={immersive}
            />
            <Stack.Screen name="HostProfile" component={HostProfileScreen} />
            <Stack.Screen name="Spark" component={MatchScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="CreateMoment" component={CreateMomentScreen} />
            <Stack.Screen
              name="Room"
              component={RoomScreen}
              options={immersive}
            />
            <Stack.Screen name="CreateRoom" component={CreateRoomScreen} />
            <Stack.Screen name="Vip" component={VipScreen} />
            <Stack.Screen name="RoyalClub" component={AristocracyScreen} />
            <Stack.Screen name="Diamonds" component={DiamondsScreen} />
            <Stack.Screen name="Visitors" component={VisitorsScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="Family" component={FamilyScreen} />
            <Stack.Screen name="Events" component={EventCenterScreen} />
            <Stack.Screen name="Store" component={StoreScreen} />
            <Stack.Screen name="MyItems" component={BackpackScreen} />
            <Stack.Screen
              name="RandomCall"
              component={RandomCallScreen}
              options={immersive}
            />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={immersive}
            />
            <Stack.Screen
              name="CallEnded"
              component={CallEndedScreen}
              options={immersive}
            />
            <Stack.Screen name="CallHistory" component={CallHistoryScreen} />
            <Stack.Screen
              name="IncomingCall"
              component={IncomingCallScreen}
              options={immersive}
            />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen
              name="DeleteAccount"
              component={DeleteAccountScreen}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
            />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
            <Stack.Screen name="Followers" component={FollowersScreen} />
            <Stack.Screen name="Report" component={ReportScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="Content" component={ContentScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
            <Stack.Screen
              name="HostDashboard"
              component={HostDashboardScreen}
            />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} />
            <Stack.Screen name="Transactions" component={TransactionsScreen} />
            <Stack.Screen name="BecomeHost" component={BecomeHostScreen} />
            <Stack.Screen name="HostApply" component={HostApplyScreen} />
            <Stack.Screen name="HostStatus" component={HostStatusScreen} />
            <Stack.Screen name="HostCenter" component={HostCenterScreen} />
            <Stack.Screen
              name="GoLive"
              component={GoLiveScreen}
              options={immersive}
            />
            <Stack.Screen
              name="MyLive"
              component={MyLiveScreen}
              options={{ ...immersive, gestureEnabled: false }}
            />
            <Stack.Screen
              name="LiveSummary"
              component={LiveSummaryScreen}
              options={immersive}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
