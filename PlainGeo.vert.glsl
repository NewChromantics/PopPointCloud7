#version 300 es
//#define MULTI_VIEW

#if defined(MULTI_VIEW)
#extension GL_OVR_multiview : require
layout(num_views=2) in;
//	gr: popengine writes these automatically (these could be up to 15 for... caves?)
uniform mat4 Pop_CameraWorldToCameraTransforms[2];
uniform mat4 Pop_CameraProjectionTransforms[2];

//	gl_ViewID_OVR is keyword which dictates which eye is being rendered (0,1,etc)
#define WorldToCameraTransform		( Pop_CameraWorldToCameraTransforms[gl_ViewID_OVR] )
#define CameraProjectionTransform	( Pop_CameraProjectionTransforms[gl_ViewID_OVR] )
#endif

in vec3 LocalPosition;
in vec3 LocalUv;
in vec3 LocalNormal;
out vec3 FragWorldPosition;
out vec3 FragLocalPosition;
out vec2 FragLocalUv;
out vec3 FragCameraPosition;	//	position in camera space
out vec2 FragViewUv;
out vec3 ClipPosition;
out vec4 FragColour;
out vec3 FragLocalNormal;
out vec3 FragWorldNormal;

//#define OCCUPANCY_IN_VERTEX
#if defined(OCCUPANCY_IN_VERTEX)
out vec4 FragOccupancySample;
out float FragOccupancyShadow;
#endif
uniform sampler2D OccupancyMapTexture;
uniform vec2 OccupancyMapTextureSize;
uniform vec3 OccupancyMapWorldMin;
uniform vec3 OccupancyMapWorldMax;

#if !defined(WorldToCameraTransform)
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
#endif

uniform vec4 Colour;
in mat4 LocalToWorldTransform;

mat4 GetLocalToWorldTransform()
{
	return LocalToWorldTransform;
}



vec3 GetWorldPos(mat4 LocalToWorldTransform)
{
	vec3 LocalPos = LocalPosition;
	vec4 WorldPos = LocalToWorldTransform * vec4(LocalPos,1.0);
	WorldPos.xyz /= WorldPos.www;
	WorldPos.w = 1.0;
	return WorldPos.xyz;
}

void main()
{
	mat4 LocalToWorldTransform = GetLocalToWorldTransform();

	vec3 WorldPos = GetWorldPos(LocalToWorldTransform);
	vec4 CameraPos = WorldToCameraTransform * vec4(WorldPos,1.0);	//	world to camera space
	vec4 ProjectionPos = CameraProjectionTransform * CameraPos;

	vec4 WorldNormal = LocalToWorldTransform * vec4(LocalNormal,0.0);
	WorldNormal.xyz = normalize(WorldNormal.xyz);


	gl_Position = ProjectionPos;
	
	FragViewUv = gl_Position.xy;
	ClipPosition = gl_Position.xyz / gl_Position.www;	//	not sure if this should divide...
	
	FragCameraPosition = CameraPos.xyz ;/// CameraPos.www;
	
	FragWorldPosition = WorldPos.xyz;
	FragLocalPosition = LocalPosition;
	FragLocalUv = LocalUv.xy;
	FragColour = Colour;
	FragLocalNormal = LocalNormal;
	FragWorldNormal = WorldNormal.xyz;
}

