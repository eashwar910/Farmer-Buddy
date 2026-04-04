export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type ManagerTabParamList = {
  Dashboard: undefined;
  Shifts: undefined;
  Settings: undefined;
};

export type EmployeeTabParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Home: { skipAutoNav?: boolean } | undefined;
  LeafDetection: undefined;
  IoTSensorScreen: undefined;
  AgronomistChat: undefined;
  SettingsScreen: undefined;
  ManagerTabs: undefined;
  EmployeeTabs: undefined;
  RecordingsList: {
    shiftId: string;
    employeeId: string;
    employeeName: string;
    recordingId?: string; // when set: show chunks for this recording session
  };
  ShiftDetails: {
    shiftId: string;
    shiftStartedAt: string;
  };
};
