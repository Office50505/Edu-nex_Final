(async () => {
  const fields=globalThis.__localQaNodes();
  const mobile=fields.find(n=>n.type?.name==='FieldInput'&&n.memoizedProps.placeholder==='Enter your mobile number');
  const password=fields.find(n=>n.type?.name==='FieldInput'&&n.memoizedProps.placeholder==='Enter your password');
  if(!mobile||!password)throw Error('Expected login form');
  mobile.memoizedProps.onChangeText('9000000002');
  password.memoizedProps.onChangeText('LocalRetest02!');
  await new Promise(resolve=>setTimeout(resolve,150));
  const button=globalThis.__localQaNodes().find(n=>n.memoizedProps?.accessibilityLabel==='Log in'&&typeof n.memoizedProps?.onPress==='function');
  if(!button||button.memoizedProps.disabled)throw Error('Login button is not ready');
  await button.memoizedProps.onPress();
  await new Promise(resolve=>setTimeout(resolve,600));
  const userNode=globalThis.__localQaNodes().find(n=>n.memoizedProps?.user?._id==='6addcefc5d47d548973c29b9');
  if(!userNode)throw Error('Synthetic account not visible after sign-in');
  return {signedIn:true,userId:userNode.memoizedProps.user._id,name:userNode.memoizedProps.user.fullName,entitlementState:userNode.memoizedProps.user.entitlementState};
})()
