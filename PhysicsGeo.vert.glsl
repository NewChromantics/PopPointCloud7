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
const bool UsePreviousPositionsTexture = true;
uniform sampler2D PhysicsPreviousPositionsTexture;
uniform sampler2D PhysicsPositionsTexture;
uniform vec2 PhysicsPositionsTextureSize;
uniform sampler2D PhysicsVelocitysTexture;

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

#define WorldVelocity	GetWorldVelocity()
vec3 GetWorldVelocity()
{
	vec4 Velocity4 = texture2D( PhysicsVelocitysTexture, PhysicsPositionUv );
	return Velocity4.xyz;
}

vec3 GetWorldPos()
{
	vec4 WorldPos = LocalToWorldTransform * vec4(LocalPosition,1.0);
	WorldPos.xyz /= WorldPos.www;
	WorldPos.w = 1.0;

	vec4 OriginWorldPos = LocalToWorldTransform * vec4(0,0,0,1);
	OriginWorldPos.xyz /= OriginWorldPos.www;
	OriginWorldPos.w = 1.0;	
	
	//	stretch world pos along velocity
	vec3 TailDelta = -WorldVelocity * 4.0 * (1.0/60.0);
	
	//	old method
	//WorldPos.xyz += -WorldVelocity * 1.5 * LocalPosition.z;
	//return WorldPos.xyz;
	
	vec3 LocalPosInWorld = WorldPos.xyz - OriginWorldPos.xyz;
	
	//	this is the opposite of what it should be and shows the future
	//	but better than flashes of past that wasnt there (better if we just stored prev pos)
	float ForwardWeight = UsePreviousPositionsTexture ? 0.0 : 0.9;
	float BackwarddWeight = UsePreviousPositionsTexture ? 0.0 : 0.1;
	vec3 NextPos = WorldPos.xyz - (TailDelta*UsePreviousPositionsTexture);
	vec3 PrevPos = WorldPos.xyz + (TailDelta*UsePreviousPositionsTexture);
	
	if ( UsePreviousPositionsTexture )
	{
		PrevPos.xyz = texture2D( PhysicsPreviousPositionsTexture, PhysicsPositionUv ).xyz;
	}
	
	//	"lerp" between depending on whether we're at front or back
	//	^^ this is why we're getting angled shapes, even if we did a cut off we
	//	could have 1/8 verts in front
	float Scale = dot( normalize(LocalPosInWorld), normalize(-TailDelta) );
	float Lerp = Scale > 0.0 ? 1.0 : 0.0;
	
	WorldPos.xyz = mix( PrevPos, NextPos, Lerp );
	return WorldPos.xyz;
}

void main()
{
	vec3 WorldPos = GetWorldPos();
	vec4 CameraPos = WorldToCameraTransform * vec4(WorldPos,1.0);	//	world to camera space
	vec4 ProjectionPos = CameraProjectionTransform * CameraPos;

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

