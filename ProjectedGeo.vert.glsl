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
//out vec4 FragColour;
out vec2 FragColourUv;
out vec3 FragLocalNormal;
out vec3 FragWorldNormal;


#if !defined(WorldToCameraTransform)
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
#endif


//	uv -> camera space
uniform mat4 DepthViewToWorldTransform;
uniform mat4 LocalToWorldTransform;
uniform sampler2D DepthImage;
uniform vec4 DepthImageRect;	//	cropping rect
uniform vec2 VoxelUv;

vec2 GetColourUv()
{
	return LocalUv.xy;
	vec2 uv = vec2( LocalUv.x, 1.0-LocalUv.y );
	
	vec2 Min = DepthImageRect.xy;
	vec2 Max = DepthImageRect.xy + DepthImageRect.zw;
	
	
	vec2 DepthUv = mix( Min, Max, uv );
	
	return DepthUv;
}

//	camera depth = 0...1 (or -1 to 1?)
float RainbowToCameraDepth(vec3 Rgb)
{
	return 0.5;
}

mat4 GetLocalToWorldTransform()
{
	return DepthViewToWorldTransform;
	
	vec2 Min = DepthImageRect.xy;
	vec2 Max = DepthImageRect.xy + DepthImageRect.zw;
	vec2 DepthUv = mix( Min, Max, VoxelUv );
	vec4 DepthRainbow = texture( DepthImage, DepthUv );
	float CameraDepth = RainbowToCameraDepth(DepthRainbow.xyz);
	
	//	get projected position
	//vec3 ViewPosition = vec3( LocalUv.xy, CameraDepth );
	vec3 ViewPosition = LocalPosition;
	vec4 WorldPosition = DepthViewToWorldTransform * vec4(ViewPosition,1.0);
	
	WorldPosition.xyz /= WorldPosition.www;
	WorldPosition.w = 1.0;
	
	//	gr: should this transform be rotated (to depth camera's local to world rotation matrix)...
	mat4 Transform = mat4( 1,0,0,0,
							0,1,0,0,	
							0,0,1,0,	
							WorldPosition );
	return Transform;
}



vec3 GetWorldPos(mat4 LocalToWorldTransform)
{
	vec3 LocalPos = LocalPosition;
	//LocalPos *= 0.011;
	LocalPos = mix( vec3(0), vec3(1), LocalPos );
	LocalPos.z = 1.0;
	
	vec4 WorldPos = LocalToWorldTransform * vec4(LocalPos,1.0);
	WorldPos.xyz /= WorldPos.www;
	WorldPos.w = 1.0;
	
	return WorldPos.xyz;
}

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

float Range01(float Min,float Max,float Value)
{
	return clamp( Range( Min, Max, Value ), 0.0, 1.0 );
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
	//FragColour = Colour;//LocalPosition;
	FragLocalPosition = LocalPosition;
	FragLocalUv = LocalUv.xy;
	FragColourUv = GetColourUv();
	FragLocalNormal = LocalNormal;
	FragWorldNormal = WorldNormal.xyz;
	
}

