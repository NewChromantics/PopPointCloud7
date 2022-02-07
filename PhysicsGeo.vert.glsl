attribute float3 LocalPosition;
attribute float3 LocalUv;
varying float3 FragWorldPosition;
varying float3 FragLocalPosition;
varying float2 FragLocalUv;
varying vec3 FragCameraPosition;	//	position in camera space
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying float TriangleIndex;
varying vec4 FragColour;

#define LocalToWorldTransform GetLocalToWorldTransform()
//attribute mat4 LocalToWorldTransform;
attribute vec2 PhysicsPositionUv;
//const vec2 PhysicsPositionUv = vec2(0,0);
uniform sampler2D PhysicsPositionsTexture;
uniform vec2 PhysicsPositionsTextureSize;

uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
attribute vec4 Colour;
//const float3 Colour = vec3(0,0,1);

mat4 GetLocalToWorldTransform()
{
	vec4 Position4 = texture2D( PhysicsPositionsTexture, PhysicsPositionUv );
	vec3 WorldPosition = Position4.xyz;
	//vec3 WorldPosition = vec3(PhysicsPositionUv,0);
	
	mat4 Transform = mat4( 1,0,0,0,	
							0,1,0,0,	
							0,0,1,0,	
							WorldPosition,1 );
	return Transform;
}

void main()
{
	float3 LocalPos = LocalPosition;
	
	float4 WorldPos = LocalToWorldTransform * float4(LocalPos,1);
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

