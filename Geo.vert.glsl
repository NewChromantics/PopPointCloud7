attribute vec3 LocalPosition;
attribute vec3 LocalUv;
varying float3 FragWorldPosition;
varying float3 FragLocalPosition;
varying float2 FragLocalUv;
varying vec3 FragCameraPosition;	//	position in camera space
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying float TriangleIndex;
varying vec4 FragColour;

attribute mat4 LocalToWorldTransform;
attribute vec3 WorldVelocity;
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
attribute vec4 Colour;


vec4 StretchWorldPosWithVelocity(vec4 WorldPos)
{
	float3 LocalPos = LocalPosition;
	WorldPos.xyz /= WorldPos.www;
	WorldPos.w = 1.0;
	
	//	stretch world pos along velocity
	vec3 VelocityDelta = -WorldVelocity * 1.5;
	//	stretch one axis of the local mesh
	//	todo: maybe we should stretch in local space...
	//		move velocity into local space, then change mesh
	WorldPos.xyz += VelocityDelta * LocalPos.z;
	return WorldPos;
}


void main()
{
	float3 LocalPos = LocalPosition;
	
	float4 WorldPos = LocalToWorldTransform * float4(LocalPos,1);
	WorldPos = StretchWorldPosWithVelocity(WorldPos);
	
	float4 CameraPos = WorldToCameraTransform * WorldPos;	//	world to camera space
	float4 ProjectionPos = CameraProjectionTransform * CameraPos;

	gl_Position = ProjectionPos;
	
	FragViewUv = gl_Position.xy;
	ClipPosition = gl_Position.xyz / gl_Position.www;	//	not sure if this should divide...
	
	FragCameraPosition = CameraPos.xyz ;/// CameraPos.www;
	
	FragWorldPosition = WorldPos.xyz;
	//FragColour = Colour;//LocalPosition;
	FragColour = vec4( LocalUv, 1 );
	FragLocalPosition = LocalPosition;
	FragLocalUv = LocalUv.xy;
	TriangleIndex = LocalUv.z;
	FragColour = Colour;
}

