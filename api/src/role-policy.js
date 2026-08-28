export const isManager=(user)=>["admin","coordinator"].includes(user?.role);

export function canEditAnnotation({user,current=null,assigned=false}) {
  if(isManager(user))return true;
  if(!user||user.role!=="annotator")return false;
  const owns=!!current&&(current.created_by===user.id||current.updated_by===user.id);
  const available=!current||current.status==="unstarted";
  return owns||(assigned&&available);
}

export function roleCapabilities(role) {
  return {
    browseAll:["annotator","coordinator","admin"].includes(role),
    useFavorites:["annotator","coordinator","admin"].includes(role),
    useRatings:["annotator","coordinator","admin"].includes(role),
    proposeCategories:["annotator","coordinator","admin"].includes(role),
    moderateCategories:["coordinator","admin"].includes(role),
    reviewRequests:["coordinator","admin"].includes(role),
    importData:role==="admin",
    manageUsers:role==="admin"
  };
}
