import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useCallback, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { COLORS } from './theme';
import LandingScreen from './screens/LandingScreen';
import EstimatorScreen from './screens/EstimatorScreen';
import PayoffScreen from './screens/PayoffScreen';
import RefinanceScreen from './screens/RefinanceScreen';
import CarScreen from './screens/CarScreen';
import SavedScreen from './screens/SavedScreen';
import ResultScreen from './screens/ResultScreen';
import StartupSplash from './components/StartupSplash';

const Tab = createBottomTabNavigator();
const EstimatorStack = createStackNavigator();

function EstimatorStackNavigator() {
  return (
    <EstimatorStack.Navigator screenOptions={{ headerShown: false }}>
      <EstimatorStack.Screen name="EstimatorHome" component={EstimatorScreen} />
      <EstimatorStack.Screen name="Result" component={ResultScreen} />
    </EstimatorStack.Navigator>
  );
}

export default function App() {
  const [showStartupSplash, setShowStartupSplash] = useState(true);
  const finishStartupSplash = useCallback(() => setShowStartupSplash(false), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: COLORS.accent,
              tabBarInactiveTintColor: COLORS.textMuted,
              tabBarStyle: {
                backgroundColor: COLORS.surface,
                borderTopColor: COLORS.border,
                borderTopWidth: 1,
                height: 88,
                paddingTop: 8,
                paddingBottom: 28,
              },
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
              tabBarIcon: ({ color, size }) => {
                let icon = 'home';
                if (route.name === 'Home') icon = 'grid';
                else if (route.name === 'Estimate') icon = 'calculator';
                else if (route.name === 'Payoff') icon = 'trending-down';
                else if (route.name === 'Refinance') icon = 'swap-horizontal';
                else if (route.name === 'Auto') icon = 'car-sport';
                else if (route.name === 'Saved') icon = 'bookmark';
                return <Ionicons name={icon} size={size} color={color} />;
              },
            })}
          >
            <Tab.Screen name="Home" component={LandingScreen} />
            <Tab.Screen name="Estimate" component={EstimatorStackNavigator} />
            <Tab.Screen name="Payoff" component={PayoffScreen} />
            <Tab.Screen name="Refinance" component={RefinanceScreen} />
            <Tab.Screen name="Auto" component={CarScreen} />
            <Tab.Screen name="Saved" component={SavedScreen} />
          </Tab.Navigator>
        </NavigationContainer>
        {showStartupSplash ? <StartupSplash onFinish={finishStartupSplash} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
