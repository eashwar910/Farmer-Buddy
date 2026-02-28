export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type ManagerTabParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

export type EmployeeTabParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  ManagerTabs: undefined;
  EmployeeTabs: undefined;
  RecordingsList: {
    shiftId: string;
    employeeId: string;
    employeeName: string;
  };
};
