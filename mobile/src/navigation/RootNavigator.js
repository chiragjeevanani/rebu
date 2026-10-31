import React, { useEffect, useState } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {
  TransitionPresets,
  createStackNavigator,
} from '@react-navigation/stack';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import TabBar from './TabBar';
import { FrameContext } from './headerSlots';
import { StackHeader } from '../components/Header';
import { TabTopBarRight, TopBarView } from '../components/Live';

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

const Stack = createStackNavigator();
const Tab = createMaterialTopTabNavigator();
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
// Recharge opened from anywhere (low balance, gifts…): the Coins page with a back button.
const WalletScreen = props => <CoinsScreen {...props} stack />;

// Tells each tab's TopBar to hand its icons to the shared bar above the pages.
const tabLayout = ({ route, children }) => (
  <FrameContext.Provider
    value={{ kind: 'tabs', routeKey: route.key, headerShown: true }}
  >
    {children}
  </FrameContext.Provider>
);

function MainTabs() {
  const { isHost } = useApp();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(null);
  return (
    // One top bar above the pager stays put while the pages swipe under it.
    <View style={[styles.tabs, { paddingTop: insets.top }]}>
      <TopBarView right={<TabTopBarRight routeKey={focused} />} />
      <MainPager isHost={isHost} onFocus={setFocused} />
    </View>
  );
}

const renderTabBar = props => <TabBar {...props} />;

function MainPager({ isHost, onFocus }) {
  return (
    // Pager-style tabs: swipe left/right between pages.
    <Tab.Navigator
      screenLayout={tabLayout}
      screenListeners={({ route }) => ({ focus: () => onFocus(route.key) })}
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

// Full-screen experiences (calls, lives, rooms) fade in without the header.
const immersive = {
  cardStyleInterpolator: ({ current }) => ({
    cardStyle: { opacity: current.progress },
  }),
  gestureEnabled: false,
};
// Screens that use <Header/> get the shared header that stays still between them.
const withHeader = { headerShown: true };

const stackLayout = ({ route, options, children }) => (
  <FrameContext.Provider
    value={{
      kind: 'stack',
      routeKey: route.key,
      headerShown: !!options.headerShown,
    }}
  >
    {children}
  </FrameContext.Provider>
);
const renderHeader = props => <StackHeader {...props} />;

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
        screenLayout={stackLayout}
        screenOptions={{
          ...TransitionPresets.SlideFromRightIOS,
          headerShown: false,
          headerMode: 'float',
          header: renderHeader,
          cardStyle: { backgroundColor: colors.background },
        }}
      >
        {!authed ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen
              name="PhoneLogin"
              component={PhoneLoginScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Otp"
              component={OtpScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="EmailAuth"
              component={EmailAuthScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="ProfileSetup"
              component={ProfileSetupScreen}
              options={withHeader}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Me"
              component={MyProfileScreen}
              options={withHeader}
            />
            <Stack.Screen name="Moments" component={MomentsScreen} />
            <Stack.Screen name="Rooms" component={RoomsScreen} />
            <Stack.Screen
              name="HostList"
              component={HostListScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="LiveRoom"
              component={LiveRoomScreen}
              options={immersive}
            />
            <Stack.Screen name="HostProfile" component={HostProfileScreen} />
            <Stack.Screen
              name="Spark"
              component={MatchScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Leaderboard"
              component={LeaderboardScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="CreateMoment"
              component={CreateMomentScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Room"
              component={RoomScreen}
              options={immersive}
            />
            <Stack.Screen
              name="CreateRoom"
              component={CreateRoomScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Vip"
              component={VipScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="RoyalClub"
              component={AristocracyScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Diamonds"
              component={DiamondsScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Visitors"
              component={VisitorsScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Tasks"
              component={TasksScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Family"
              component={FamilyScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Events"
              component={EventCenterScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Store"
              component={StoreScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="MyItems"
              component={BackpackScreen}
              options={withHeader}
            />
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
            <Stack.Screen
              name="CallHistory"
              component={CallHistoryScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="IncomingCall"
              component={IncomingCallScreen}
              options={immersive}
            />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="DeleteAccount"
              component={DeleteAccountScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="BlockedUsers"
              component={BlockedUsersScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Followers"
              component={FollowersScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Report"
              component={ReportScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Verification"
              component={VerificationScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Content"
              component={ContentScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Wallet"
              component={WalletScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="HostDashboard"
              component={HostDashboardScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Withdraw"
              component={WithdrawScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="Transactions"
              component={TransactionsScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="BecomeHost"
              component={BecomeHostScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="HostApply"
              component={HostApplyScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="HostStatus"
              component={HostStatusScreen}
              options={withHeader}
            />
            <Stack.Screen
              name="HostCenter"
              component={HostCenterScreen}
              options={withHeader}
            />
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

const styles = StyleSheet.create({
  tabs: { flex: 1, backgroundColor: colors.background },
});
